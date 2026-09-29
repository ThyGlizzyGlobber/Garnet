import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { scriptAi, type AiOutput } from './helpers/fake-ai';

type Output = AiOutput;

const { openDb } = await import('@/db/client');
const { runMigrations } = await import('@/db/migrate');
const { archiveDocument, getDocument } = await import('@/ingest/archive');
const { processDocument } = await import('@/ingest/pipeline');
const { linkMember, signInAccount } = await import('@/lib/accounts');
const { cadenceFromPeriod, cleanProviderName, sameProvider } = await import('@/lib/auto-service');
const { getBill, listBills } = await import('@/lib/bills');
const { devOutbox } = await import('@/lib/email');
const { createHousehold } = await import('@/lib/households');
const { createMember } = await import('@/lib/members');
const { createService, getService, listServices } = await import('@/lib/services');

type Db = ReturnType<typeof openDb>['db'];
let dir: string;
let db: Db;
let close: () => void;

beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hud-autosvc-'));
  runMigrations(dir);
  const opened = openDb(dir);
  db = opened.db;
  close = () => opened.sqlite.close();
});

afterAll(() => {
  close();
  fs.rmSync(dir, { recursive: true, force: true });
});

const bill = (
  provider: string,
  period: [string, string] = ['2026-06-01', '2026-08-31'],
): Output => ({
  document_type: 'bill',
  provider,
  document_date: null,
  service_type: 'electricity',
  bill: {
    amount: 412.5,
    currency: 'AUD',
    tax_amount: null,
    tax_label: null,
    period_start: period[0],
    period_end: period[1],
    issue_date: null,
    due_date: '2026-09-20',
    usage_quantity: 1180,
    usage_unit: 'kWh',
    invoice_number: `R-${Math.random().toString(36).slice(2, 8)}`,
    account_number: '4410 2231',
    auto_pay: true,
    previous_payment: null,
    metrics: [],
    instalments: null,
  },
  payment: null,
  page_rotation: [],
  confidence: 0.95,
  notes: null,
});

let n = 0;
function setup() {
  const tag = `a${++n}`;
  const hh = createHousehold(
    {
      name: `Auto ${tag}`,
      currency: 'AUD',
      locale: 'en-AU',
      timezone: 'Australia/Melbourne',
      fiscalYearStartMonth: 7,
      splitMode: 'shared',
    },
    db,
  );
  const person = (name: string, role: 'owner' | 'member') => {
    const m = createMember(hh.id, { name, role, activeFrom: '2026-01-01' }, db);
    const email = `${name.toLowerCase()}.${tag}@example.com`;
    const a = signInAccount({ email }, db);
    linkMember(m.id, a.id, a.email, db);
    return { ...m, email };
  };
  return { hh, jo: person('Jo', 'owner'), sam: person('Sam', 'member') };
}

const upload = (hid: string, extra: Record<string, unknown> = {}) =>
  archiveDocument(
    hid,
    {
      kind: 'upload',
      buffer: Buffer.from(`An electricity bill with plenty of readable text.\n${Math.random()}`),
      originalFilename: 'bill.txt',
      mimeType: 'text/plain',
      ...extra,
    },
    db,
  ).doc;

const email = (from: string, domain: string) => ({
  kind: 'email',
  emailFrom: from,
  emailSubject: 'Your new bill',
  senderDomain: domain,
  senderVerified: true,
});

describe('provider names and billing frequency', () => {
  it('drop company suffixes and read the cadence from the period length', () => {
    expect(cleanProviderName('Red Energy Pty Ltd')).toBe('Red Energy');
    expect(cleanProviderName('Origin Energy Limited')).toBe('Origin Energy');
    expect(cleanProviderName('AGL')).toBe('AGL');
    expect(cadenceFromPeriod('2026-06-01', '2026-06-30')).toBe('monthly');
    expect(cadenceFromPeriod('2026-06-01', '2026-08-31')).toBe('quarterly');
    expect(cadenceFromPeriod('2026-06-01', '2026-07-31')).toBe('bimonthly');
    expect(cadenceFromPeriod('2026-01-01', '2026-12-31')).toBe('annual');
    expect(sameProvider('AGL', 'AGL Energy')).toBe(true);
    expect(sameProvider('Red Energy', 'Origin Energy')).toBe(false);
  });
});

describe('services set up from a first bill', () => {
  it('are created from an upload, paid by the admin, split equally, and the admin is told', async () => {
    const { hh, jo } = setup();
    scriptAi(bill('Red Energy Pty Ltd'));
    const outcome = await processDocument(hh.id, upload(hh.id).id, db);
    expect(outcome.status).toBe('extracted');
    const [svc] = listServices(hh.id, {}, db);
    expect(svc).toMatchObject({
      name: 'Electricity',
      provider: 'Red Energy',
      cadence: 'quarterly',
      payerMemberId: jo.id,
      splitMode: 'equal',
      autoPay: true,
      accountRef: '4410 2231',
    });
    expect(getBill(hh.id, outcome.billId!, db)?.serviceId).toBe(svc!.id);
    await vi.waitFor(() =>
      expect(devOutbox.some((e) => e.to === jo.email && e.subject.startsWith('New service'))).toBe(
        true,
      ),
    );
    const mail = devOutbox.find((e) => e.to === jo.email && e.subject.startsWith('New service'))!;
    expect(mail.subject).toBe('New service: Electricity (Red Energy)');
    expect(mail.text).toContain(`/services/${svc!.id}/edit`);
  });

  it("trust the provider's own signed domain, and get a distinct name when one is taken", async () => {
    const { hh, jo } = setup();
    createService(
      hh.id,
      { typeSlug: 'electricity', name: 'Electricity', provider: 'AGL', payerMemberId: jo.id },
      db,
    );
    scriptAi(bill('Red Energy'));
    const d = upload(hh.id, email('Red Energy <bills@redenergy.com.au>', 'redenergy.com.au'));
    expect((await processDocument(hh.id, d.id, db)).status).toBe('extracted');
    const red = listServices(hh.id, {}, db).find((s) => s.provider === 'Red Energy')!;
    expect(red.name).toBe('Electricity (Red Energy)');
    expect(red.trustedSenders).toEqual(['redenergy.com.au']);
  });

  it('are never created from a stranger’s email', async () => {
    const { hh } = setup();
    scriptAi(bill('Red Energy'));
    const d = upload(hh.id, email('Red Energy <bills@attacker.example>', 'attacker.example'));
    expect((await processDocument(hh.id, d.id, db)).status).toBe('needs_review');
    expect(listServices(hh.id, { includeInactive: true }, db)).toHaveLength(0);
    expect(getDocument(hh.id, d.id, db)?.status).toBe('needs_review');
  });

  it('make the member who forwarded the bill its payer', async () => {
    const { hh, sam } = setup();
    scriptAi(bill('Red Energy'));
    const d = upload(hh.id, email(`Sam <${sam.email}>`, 'example.com'));
    expect((await processDocument(hh.id, d.id, db)).status).toBe('extracted');
    expect(listServices(hh.id, {}, db)[0]?.payerMemberId).toBe(sam.id);
  });

  it('switch a cancelled service for the same provider back on instead of duplicating it', async () => {
    const { hh, jo } = setup();
    const old = createService(
      hh.id,
      {
        typeSlug: 'electricity',
        name: 'Power',
        provider: 'Red Energy',
        payerMemberId: jo.id,
        isActive: false,
      },
      db,
    );
    scriptAi(bill('Red Energy Pty Ltd'));
    expect((await processDocument(hh.id, upload(hh.id).id, db)).status).toBe('extracted');
    expect(listServices(hh.id, { includeInactive: true }, db)).toHaveLength(1);
    expect(getService(hh.id, old.id, db)?.isActive).toBe(true);
    expect(listBills(hh.id, {}, db)[0]?.serviceId).toBe(old.id);
  });

  it('tell apart two services from one provider by type', async () => {
    const { hh, jo } = setup();
    const svc = (typeSlug: string, name: string) =>
      createService(hh.id, { typeSlug, name, provider: 'Origin Energy', payerMemberId: jo.id }, db);
    svc('gas', 'Gas');
    const power = svc('electricity', 'Power');
    scriptAi(bill('Origin Energy'));
    const outcome = await processDocument(hh.id, upload(hh.id).id, db);
    expect(getBill(hh.id, outcome.billId!, db)?.serviceId).toBe(power.id);
    expect(listServices(hh.id, {}, db)).toHaveLength(2);
  });
});
