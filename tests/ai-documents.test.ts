import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { scriptAi, type AiOutput } from './helpers/fake-ai';

type Output = AiOutput;

const { openDb } = await import('@/db/client');
const { runMigrations } = await import('@/db/migrate');
const { archiveDocument, getDocument } = await import('@/ingest/archive');
const { processDocument } = await import('@/ingest/pipeline');
const { toResult } = await import('@/ingest/extractors/llm/anthropic');
const { createBill, getBill, listBills } = await import('@/lib/bills');
const { createHousehold } = await import('@/lib/households');
const { createMember } = await import('@/lib/members');
const { createService, getService } = await import('@/lib/services');
const { AI_READ, usageCount } = await import('@/lib/usage');

type Db = ReturnType<typeof openDb>['db'];
let dir: string;
let db: Db;
let close: () => void;

beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hud-ai-'));
  runMigrations(dir);
  const opened = openDb(dir);
  db = opened.db;
  close = () => opened.sqlite.close();
});

afterAll(() => {
  close();
  fs.rmSync(dir, { recursive: true, force: true });
});

const base: Output = {
  document_type: 'other',
  provider: null,
  service_type: null,
  bill: null,
  payment: null,
  confidence: 0.95,
  notes: null,
};

let n = 0;
function setup(provider = 'AGL') {
  const hh = createHousehold(
    {
      name: `AI ${++n}`,
      currency: 'AUD',
      locale: 'en-AU',
      timezone: 'Australia/Melbourne',
      fiscalYearStartMonth: 7,
      splitMode: 'shared',
    },
    db,
  );
  const jo = createMember(hh.id, { name: 'Jo', role: 'owner', activeFrom: '2026-01-01' }, db);
  const svc = createService(
    hh.id,
    { typeSlug: 'electricity', name: 'Power', provider, payerMemberId: jo.id },
    db,
  );
  const bill = createBill(
    hh.id,
    {
      serviceId: svc.id,
      amountMinor: 41000,
      periodStart: '2026-06-01',
      periodEnd: '2026-08-31',
      dueDate: '2026-09-15',
      source: 'manual',
      externalRef: 'INV-7',
    },
    db,
  );
  return { hh, svc, bill };
}

const doc = (
  hid: string,
  text: string,
  extra: Record<string, unknown> = {},
): ReturnType<typeof archiveDocument>['doc'] =>
  archiveDocument(
    hid,
    {
      kind: 'upload',
      buffer: Buffer.from(`${text}\n${Math.random()}`),
      originalFilename: 'doc.txt',
      mimeType: 'text/plain',
      ...extra,
    },
    db,
  ).doc;

const TEXT = 'Some provider document with enough text to be read by the AI reader, honestly.';

describe('mapping the AI record', () => {
  it('turns a receipt into a document with tidy invoice numbers and no bill dates', () => {
    const r = toResult(
      {
        ...base,
        document_type: 'payment_receipt',
        provider: 'AGL Energy',
        payment: { date: '2026-09-15', amount: 410, currency: 'aud', invoice_numbers: ['#INV-7'] },
      },
      { services: [], serviceTypes: ['electricity'], defaultCurrency: 'AUD' },
    )!;
    expect(r.document).toEqual({
      kind: 'payment_receipt',
      provider: 'AGL Energy',
      payment: { date: '2026-09-15', amountMinor: 41000, currency: 'AUD', invoiceRefs: ['INV-7'] },
    });
    expect(r.bill.periodStart).toBe('');
  });

  it('carries auto-pay and last month through for bills', () => {
    const r = toResult(
      {
        ...base,
        document_type: 'bill',
        provider: 'AGL',
        service_type: 'electricity',
        bill: {
          amount: 400,
          currency: 'AUD',
          tax_amount: null,
          tax_label: null,
          period_start: '2026-09-01',
          period_end: '2026-11-30',
          issue_date: null,
          due_date: '2026-12-15',
          usage_quantity: 1200,
          usage_unit: 'kWh',
          invoice_number: 'INV-8',
          account_number: null,
          auto_pay: true,
          previous_payment: { due_date: '2026-09-15', amount_due: 410, amount_received: 410 },
        },
      },
      { services: [], serviceTypes: ['electricity'], defaultCurrency: 'AUD' },
    )!;
    expect(r.document?.kind).toBe('bill');
    expect(r.bill.autoPay).toBe(true);
    expect(r.bill.previousPayment).toEqual({
      dueDate: '2026-09-15',
      amountDueMinor: 41000,
      receivedMinor: 41000,
    });
  });
});

describe('the pipeline acting on what the AI says a document is', () => {
  it('marks the invoice a receipt names as paid, matching "AGL Energy" to the AGL service', async () => {
    const { hh, bill } = setup();
    scriptAi({
      ...base,
      document_type: 'payment_receipt',
      provider: 'AGL Energy',
      payment: { date: '2026-09-14', amount: 410, currency: 'AUD', invoice_numbers: ['INV-7'] },
    });
    const d = doc(hh.id, TEXT);
    expect((await processDocument(hh.id, d.id, db)).status).toBe('notice');
    expect(getBill(hh.id, bill.id, db)?.paidToProviderAt).toBe('2026-09-14T00:00:00Z');
    expect(listBills(hh.id, {}, db)).toHaveLength(1);
  });

  it('flags the bill for a payment-failed notice a member uploads', async () => {
    const { hh, bill } = setup();
    scriptAi({
      ...base,
      document_type: 'payment_failed',
      provider: 'AGL',
      payment: { date: '2026-09-15', amount: 410, currency: 'AUD', invoice_numbers: [] },
    });
    await processDocument(hh.id, doc(hh.id, TEXT).id, db);
    expect(getBill(hh.id, bill.id, db)?.alertKind).toBe('payment_failed');
  });

  it("never lets a stranger's email use the AI's provider name to change a bill", async () => {
    const { hh, bill } = setup('Aussie Broadband');
    scriptAi({
      ...base,
      document_type: 'payment_failed',
      provider: 'Aussie Broadband',
      payment: null,
    });
    const spoof = doc(hh.id, TEXT, {
      kind: 'email',
      emailFrom: 'Aussie Broadband <billing@attacker.example>',
      emailSubject: 'Account notice',
      senderDomain: 'attacker.example',
      senderVerified: true,
    });
    await processDocument(hh.id, spoof.id, db);
    expect(getBill(hh.id, bill.id, db)?.alertKind).toBeNull();
  });

  it('changes nothing when the reading is unsure', async () => {
    const { hh, bill } = setup();
    scriptAi({ ...base, document_type: 'payment_failed', provider: 'AGL', confidence: 0.4 });
    const d = doc(hh.id, TEXT);
    expect((await processDocument(hh.id, d.id, db)).reason).toBe('unsure');
    expect(getBill(hh.id, bill.id, db)?.alertKind).toBeNull();
  });

  it('files other documents as notices, but sends an unsure one that looks like a bill to review', async () => {
    const { hh } = setup();
    scriptAi({ ...base, document_type: 'other', provider: 'AGL' });
    const other = doc(hh.id, TEXT);
    await processDocument(hh.id, other.id, db);
    expect(getDocument(hh.id, other.id, db)?.status).toBe('notice');

    scriptAi({ ...base, document_type: 'other', provider: 'AGL', confidence: 0.3 });
    const billish = doc(hh.id, 'Your bill: amount due $88.10, pay by 3 November. Tax invoice.', {
      kind: 'email',
      emailSubject: 'Your bill',
      senderDomain: null,
      senderVerified: false,
    });
    await processDocument(hh.id, billish.id, db);
    expect(getDocument(hh.id, billish.id, db)?.status).toBe('needs_review');
  });

  it('adds an AI-read bill and applies what it says about last month and auto-pay', async () => {
    const { hh, svc, bill } = setup();
    scriptAi({
      ...base,
      document_type: 'bill',
      provider: 'AGL',
      service_type: 'electricity',
      bill: {
        amount: 400,
        currency: 'AUD',
        tax_amount: null,
        tax_label: null,
        period_start: '2026-09-01',
        period_end: '2026-11-30',
        issue_date: null,
        due_date: '2026-12-15',
        usage_quantity: null,
        usage_unit: null,
        invoice_number: 'INV-8',
        account_number: null,
        auto_pay: true,
        previous_payment: { due_date: '2026-09-15', amount_due: 410, amount_received: 410 },
      },
    });
    await processDocument(hh.id, doc(hh.id, TEXT).id, db);
    expect(
      listBills(hh.id, {}, db)
        .map((b) => b.externalRef)
        .sort(),
    ).toEqual(['INV-7', 'INV-8']);
    expect(getBill(hh.id, bill.id, db)?.paidToProviderAt).toBe('2026-09-15T00:00:00Z');
    expect(getService(hh.id, svc.id, db)?.autoPay).toBe(true);
  });
});

describe('when the AI reader fails', () => {
  it('sends email to review with the reason, never files it as "not a bill", and charges nothing', async () => {
    const { hh } = setup();
    scriptAi(() => {
      throw new Error(
        '400 {"type":"error","error":{"type":"invalid_request_error","message":"This API key is not scoped to a workspace."}}',
      );
    });
    try {
      const d = doc(
        hh.id,
        'Hi, forwarding this on. Cheers, Lisa. Thanks for everything this week.',
        {
          kind: 'email',
          emailSubject: 'Fwd: Your gas',
          senderDomain: 'example.com',
          senderVerified: true,
        },
      );
      const outcome = await processDocument(hh.id, d.id, db);
      expect(outcome.status).toBe('needs_review');
      const reason = JSON.parse(getDocument(hh.id, d.id, db)!.extractionJson!).reason as string;
      expect(reason).toBe(
        'The AI reader failed, so this needs checking by hand (This API key is not scoped to a workspace.)',
      );
      expect(usageCount(hh.id, AI_READ, db)).toBe(0);
    } finally {
      scriptAi(null);
    }
  });
});
