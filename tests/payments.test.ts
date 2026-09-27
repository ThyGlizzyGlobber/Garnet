import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { openDb, type Db } from '@/db/client';
import { runMigrations } from '@/db/migrate';
import { archiveDocument, getDocument, type ArchiveInput } from '@/ingest/archive';
import { aussieBroadbandExtractor } from '@/ingest/extractors/template/aussie-broadband';
import { processDocument } from '@/ingest/pipeline';
import { parseReceipt } from '@/ingest/receipts';
import { settleAutoPaidBills } from '@/lib/autopay';
import { createBill, getBill, setBillAlert } from '@/lib/bills';
import { createHousehold } from '@/lib/households';
import { createMember } from '@/lib/members';
import { createService, getService, updateService } from '@/lib/services';

let dir: string;
let db: Db;
let close: () => void;

beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hud-payments-'));
  runMigrations(dir);
  const opened = openDb(dir);
  db = opened.db;
  close = () => opened.sqlite.close();
});

afterAll(() => {
  close();
  fs.rmSync(dir, { recursive: true, force: true });
});

const fixture = (name: string) =>
  fs.readFileSync(path.join(process.cwd(), 'tests/fixtures', name), 'utf8');
const RECEIPT = fixture('aussie-broadband-receipt.txt');
const INVOICE = fixture('aussie-broadband.txt');

let n = 0;
function setup() {
  const hh = createHousehold(
    {
      name: `Payments ${++n}`,
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
    { typeSlug: 'internet', name: 'Internet', provider: 'Aussie Broadband', payerMemberId: jo.id },
    db,
  );
  const bill = (ref: string, due: string, start: string, end: string) =>
    createBill(
      hh.id,
      {
        serviceId: svc.id,
        amountMinor: 12900,
        periodStart: start,
        periodEnd: end,
        dueDate: due,
        source: 'manual',
        externalRef: ref,
      },
      db,
    );
  return { hh, svc, bill };
}

function upload(hid: string, text: string, extra: Partial<ArchiveInput> = {}) {
  return archiveDocument(
    hid,
    {
      kind: 'upload',
      buffer: Buffer.from(text),
      originalFilename: 'doc.txt',
      mimeType: 'text/plain',
      ...extra,
    },
    db,
  ).doc;
}

describe('payment receipts', () => {
  it('are read from the Aussie Broadband layout', () => {
    expect(parseReceipt(RECEIPT)).toEqual({
      provider: 'Aussie Broadband',
      paidDate: '2026-07-28',
      totalMinor: 12900,
      method: 'Credit Card',
      invoices: [{ ref: '60097874', amountMinor: 12900 }],
    });
    expect(parseReceipt(INVOICE)).toBeNull();
  });

  it('mark the invoice they name as paid on the receipt date and clear any flag', async () => {
    const { hh, bill } = setup();
    const july = bill('60097874', '2026-07-28', '2026-07-14', '2026-08-13');
    setBillAlert(hh.id, july.id, 'payment_failed', null, db);
    const doc = upload(hh.id, RECEIPT);
    const outcome = await processDocument(hh.id, doc.id, db);
    expect(outcome).toMatchObject({ status: 'notice', reason: 'receipt', billId: july.id });
    const after = getBill(hh.id, july.id, db)!;
    expect(after.paidToProviderAt).toBe('2026-07-28T00:00:00Z');
    expect(after.alertKind).toBeNull();
  });

  it('say so, and change nothing, when the invoice is not in the app', async () => {
    const { hh } = setup();
    const doc = upload(hh.id, RECEIPT);
    expect((await processDocument(hh.id, doc.id, db)).status).toBe('notice');
    const reason = JSON.parse(getDocument(hh.id, doc.id, db)!.extractionJson!).reason as string;
    expect(reason).toMatch(/isn't in the app yet/);
  });

  it('only act on emailed receipts that really come from the provider', async () => {
    const { hh, bill } = setup();
    const july = bill('60097874', '2026-07-28', '2026-07-14', '2026-08-13');
    const spoof = upload(hh.id, RECEIPT, {
      kind: 'pdf',
      emailFrom: 'Aussie Broadband <billing@attacker.example>',
      senderDomain: 'attacker.example',
      senderVerified: true,
    });
    await processDocument(hh.id, spoof.id, db);
    expect(getBill(hh.id, july.id, db)?.paidToProviderAt).toBeNull();
    const real = upload(hh.id, `${RECEIPT}\n`, {
      kind: 'pdf',
      emailFrom: 'Aussie Broadband <billing@aussiebroadband.com.au>',
      senderDomain: 'aussiebroadband.com.au',
      senderVerified: true,
    });
    await processDocument(hh.id, real.id, db);
    expect(getBill(hh.id, july.id, db)?.paidToProviderAt).toBe('2026-07-28T00:00:00Z');
  });
});

describe('what an invoice says about last month', () => {
  it('is read from the invoice, along with automatic payment', async () => {
    const r = await aussieBroadbandExtractor.extract({
      text: INVOICE,
      locale: 'en-AU',
      services: [],
      serviceTypes: [],
      email: null,
      filename: null,
      defaultCurrency: 'AUD',
    });
    expect(r?.bill.autoPay).toBe(true);
    expect(r?.bill.previousPayment).toEqual({
      dueDate: '2026-05-28',
      amountDueMinor: 12900,
      receivedMinor: 12900,
    });
  });

  it('marks the previous bill paid and remembers the service pays automatically', async () => {
    const { hh, svc, bill } = setup();
    const may = bill('58000000', '2026-05-28', '2026-05-14', '2026-06-13');
    await processDocument(hh.id, upload(hh.id, INVOICE).id, db);
    expect(getBill(hh.id, may.id, db)?.paidToProviderAt).toBe('2026-05-28T00:00:00Z');
    expect(getService(hh.id, svc.id, db)?.autoPay).toBe(true);
  });

  it('flags the previous bill when the provider received nothing', async () => {
    const { hh, bill } = setup();
    const may = bill('58000000', '2026-05-28', '2026-05-14', '2026-06-13');
    const unpaid = INVOICE.replace('$129.00 $129.00 28 May 2026', '$129.00 $0.00 28 May 2026');
    await processDocument(hh.id, upload(hh.id, unpaid).id, db);
    const after = getBill(hh.id, may.id, db)!;
    expect(after.paidToProviderAt).toBeNull();
    expect(after.alertKind).toBe('overdue');
  });
});

describe('automatically paid services', () => {
  it('count past-due bills as paid on their due date, unless a problem was reported', () => {
    const { hh, svc, bill } = setup();
    updateService(hh.id, svc.id, { autoPay: true }, db);
    const past = bill('A1', '2026-09-20', '2026-08-20', '2026-09-19');
    const flagged = bill('A2', '2026-09-21', '2026-08-21', '2026-09-20');
    const future = bill('A3', '2026-10-20', '2026-09-20', '2026-10-19');
    setBillAlert(hh.id, flagged.id, 'payment_failed', null, db);
    settleAutoPaidBills(new Date('2026-09-27T23:00:00Z'), db);
    expect(getBill(hh.id, past.id, db)?.paidToProviderAt).toBe('2026-09-20T00:00:00Z');
    expect(getBill(hh.id, flagged.id, db)?.paidToProviderAt).toBeNull();
    expect(getBill(hh.id, future.id, db)?.paidToProviderAt).toBeNull();
  });

  it('leave services that are not paid automatically alone', () => {
    const { hh, bill } = setup();
    const past = bill('M1', '2026-09-20', '2026-08-20', '2026-09-19');
    settleAutoPaidBills(new Date('2026-09-27T23:00:00Z'), db);
    expect(getBill(hh.id, past.id, db)?.paidToProviderAt).toBeNull();
  });
});
