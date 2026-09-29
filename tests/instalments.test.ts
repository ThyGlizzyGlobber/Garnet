import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { openDb, type Db } from '@/db/client';
import { runMigrations } from '@/db/migrate';
import { archiveDocument } from '@/ingest/archive';
import { toResult } from '@/ingest/extractors/llm/anthropic';
import { processDocument } from '@/ingest/pipeline';
import { settleAutoPaidBills } from '@/lib/autopay';
import {
  createBill,
  getBill,
  listBills,
  setBillAlert,
  setBillPaidToProvider,
  setInstalmentPaid,
  setPaymentPlan,
  setSharePaid,
  updateBill,
} from '@/lib/bills';
import { createHousehold } from '@/lib/households';
import { dueNow, planUndecided, unpaidMinor } from '@/lib/instalments';
import { createMember } from '@/lib/members';
import { remindersFor } from '@/lib/reminders';
import { filterBills } from '@/lib/bill-search';
import { createService, updateService } from '@/lib/services';
import { settlementRate } from '@/lib/stats';
import { scriptAi, type AiOutput } from './helpers/fake-ai';

let dir: string;
let db: Db;
let close: () => void;

beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hud-instalments-'));
  runMigrations(dir);
  const opened = openDb(dir);
  db = opened.db;
  close = () => opened.sqlite.close();
});

afterAll(() => {
  close();
  fs.rmSync(dir, { recursive: true, force: true });
});

afterEach(() => scriptAi(null));

/** Before the notice's pay-in-full date (30 Sep 2026). */
const TODAY = '2026-09-20';

/** A fictional annual rates notice: pay $2,000.35 in full, or four instalments. */
const OPTIONS = [
  { dueDate: '2026-09-30', amountMinor: 50000 },
  { dueDate: '2026-11-30', amountMinor: 50000 },
  { dueDate: '2027-03-01', amountMinor: 50000 },
  { dueDate: '2027-05-31', amountMinor: 50035 },
];

let n = 0;
function setup() {
  const hh = createHousehold(
    {
      name: `Instalments ${++n}`,
      currency: 'AUD',
      locale: 'en-AU',
      timezone: 'Australia/Melbourne',
      fiscalYearStartMonth: 7,
      splitMode: 'shared',
    },
    db,
  );
  const jo = createMember(hh.id, { name: 'Jo', role: 'owner', activeFrom: '2025-01-01' }, db);
  const kim = createMember(hh.id, { name: 'Kim', activeFrom: '2025-01-01' }, db);
  const svc = createService(
    hh.id,
    {
      typeSlug: 'other',
      name: 'Council rates',
      provider: 'City of Riverside',
      payerMemberId: jo.id,
    },
    db,
  );
  const rates = () =>
    createBill(
      hh.id,
      {
        serviceId: svc.id,
        amountMinor: 200035,
        periodStart: '2026-07-01',
        periodEnd: '2027-06-30',
        issueDate: '2026-08-11',
        dueDate: '2026-09-30',
        source: 'manual',
        instalments: OPTIONS,
      },
      db,
    );
  return { hh, jo, kim, svc, rates };
}

describe('reading instalments from a bill', () => {
  const base: AiOutput = {
    document_type: 'bill',
    provider: 'City of Riverside',
    document_date: '2026-08-11',
    service_type: 'other',
    bill: {
      amount: 2000.35,
      currency: 'AUD',
      tax_amount: null,
      tax_label: null,
      period_start: '2026-07-01',
      period_end: '2027-06-30',
      issue_date: '2026-08-11',
      due_date: '2026-09-30',
      usage_quantity: null,
      usage_unit: null,
      invoice_number: null,
      account_number: '1634',
      auto_pay: false,
      previous_payment: null,
      metrics: [],
      instalments: [
        { due_date: '2027-05-31', amount: 500.35 },
        { due_date: '2026-09-30', amount: 500 },
        { due_date: '2026-11-30', amount: 500 },
        { due_date: '2027-03-01', amount: 500 },
      ],
    },
    payment: null,
    confidence: 0.95,
    notes: null,
  };
  const input = { services: [], serviceTypes: ['other'], defaultCurrency: 'AUD' };

  it('keeps every instalment in date order, in minor units', () => {
    const r = toResult(base, input)!;
    expect(r.bill.amountMinor).toBe(200035);
    expect(r.bill.instalments).toEqual(OPTIONS);
  });

  it('drops options it cannot use, with a warning, and still reads the bill', () => {
    const r = toResult(
      {
        ...base,
        bill: {
          ...base.bill!,
          instalments: [
            { due_date: '30/09/2026', amount: 500 },
            { due_date: '2026-11-30', amount: 500 },
          ],
        },
      },
      input,
    )!;
    expect(r.bill.instalments).toBeNull();
    expect(r.warnings).toContain('The instalment options could not be read');
    expect(r.confidence).toBe(0.95);
  });

  it('turns a notice read by the AI into a bill offering instalments', async () => {
    const { hh, svc } = setup();
    scriptAi(base);
    const doc = archiveDocument(
      hh.id,
      {
        kind: 'upload',
        buffer: Buffer.from('City of Riverside rates and valuation notice 2026-27'),
        originalFilename: 'rates.txt',
        mimeType: 'text/plain',
      },
      db,
    ).doc;
    const outcome = await processDocument(hh.id, doc.id, db);
    expect(outcome.status).toBe('extracted');
    const b = getBill(hh.id, outcome.billId!, db)!;
    expect(b.serviceId).toBe(svc.id);
    expect(b.instalments.map((i) => [i.seq, i.dueDate, i.amountMinor])).toEqual(
      OPTIONS.map((o, i) => [i + 1, o.dueDate, o.amountMinor]),
    );
    expect(b.paymentPlan).toBeNull();
    expect(b.fullAmountMinor).toBe(200035);
  });
});

describe('a bill offering instalments', () => {
  it('starts out as paid in full, waiting for someone to choose', () => {
    const { hh, rates } = setup();
    const b = rates();
    expect(planUndecided(b)).toBe(true);
    expect(b.fullDueDate).toBe('2026-09-30');
    expect(b.shares.map((s) => [s.instalment, s.amountMinor]).sort()).toEqual([
      [0, 100017],
      [0, 100018],
    ]);
    expect(dueNow(b)).toMatchObject({ amountMinor: 200035, dueDate: '2026-09-30', seq: null });
    expect(listBills(hh.id, {}, db)[0]!.instalments).toHaveLength(4);
  });

  it('paid by instalments: splits each instalment and follows its due dates', () => {
    const { hh, jo, kim, rates } = setup();
    const b = setPaymentPlan(hh.id, rates().id, 'instalments', db, TODAY);
    expect(b.paymentPlan).toBe('instalments');
    expect(b.amountMinor).toBe(200035);
    expect(b.dueDate).toBe('2026-09-30');
    expect(b.shares).toHaveLength(8);
    const kims = b.shares.filter((s) => s.memberId === kim.id);
    expect(kims.map((s) => [s.instalment, s.dueDate, s.amountMinor, s.paidAt])).toEqual([
      [1, '2026-09-30', 25000, null],
      [2, '2026-11-30', 25000, null],
      [3, '2027-03-01', 25000, null],
      [4, '2027-05-31', 25017, null],
    ]);
    // The payer's part of each instalment is theirs to pay the provider.
    expect(
      b.shares.filter((s) => s.memberId === jo.id).every((s) => s.paidMethod === 'payer'),
    ).toBe(true);
    // Each instalment's reference names its own month (references stop at 18 characters).
    expect(kims.map((s) => s.paymentReference)).toEqual([
      'Council rates Sep2',
      'Council rates Nov2',
      'Council rates Mar2',
      'Council rates May2',
    ]);

    // Kim's reminders are per instalment, on each instalment's date.
    const rs = remindersFor(hh.id, kim.id, '2026-09-25', 7, db);
    expect(rs.map((r) => [r.share.instalment, r.daysUntilDue, r.level])).toEqual([
      [1, 5, 'due_soon'],
      [2, 66, 'upcoming'],
      [3, 157, 'upcoming'],
      [4, 248, 'upcoming'],
    ]);
    // Settlement for November counts only November's instalment.
    expect(settlementRate(hh.id, '2026-11', db)).toMatchObject({ paid: 0, total: 1 });
  });

  it('moves on to the next instalment as each is paid, and is paid once the last one is', () => {
    const { hh, rates } = setup();
    const id = setPaymentPlan(hh.id, rates().id, 'instalments', db, TODAY).id;
    setInstalmentPaid(hh.id, id, 1, true, db, '2026-09-18T00:00:00Z');
    let b = getBill(hh.id, id, db)!;
    expect(b.dueDate).toBe('2026-11-30');
    expect(b.paidToProviderAt).toBeNull();
    expect(dueNow(b)).toMatchObject({ amountMinor: 50000, seq: 2, of: 4 });
    expect(unpaidMinor(b)).toBe(150035);
    for (const seq of [2, 3, 4])
      setInstalmentPaid(hh.id, id, seq, true, db, '2027-05-01T00:00:00Z');
    b = getBill(hh.id, id, db)!;
    expect(b.paidToProviderAt).toBe('2027-05-01T00:00:00Z');
    expect(b.dueDate).toBe('2027-05-31');
    // Undo reopens it.
    setInstalmentPaid(hh.id, id, 4, false, db);
    b = getBill(hh.id, id, db)!;
    expect(b.paidToProviderAt).toBeNull();
    expect(dueNow(b).seq).toBe(4);
  });

  it('takes a payment to the provider as the next instalments it covers', () => {
    const { hh, rates } = setup();
    const id = setPaymentPlan(hh.id, rates().id, 'instalments', db, TODAY).id;
    setBillPaidToProvider(hh.id, id, true, db, '2026-09-20T00:00:00Z', 100000);
    let b = getBill(hh.id, id, db)!;
    expect(b.instalments.map((i) => !!i.paidToProviderAt)).toEqual([true, true, false, false]);
    expect(b.dueDate).toBe('2027-03-01');
    // Without an amount, one instalment.
    setBillPaidToProvider(hh.id, id, true, db);
    b = getBill(hh.id, id, db)!;
    expect(b.instalments.map((i) => !!i.paidToProviderAt)).toEqual([true, true, true, false]);
    // A failed payment reopens the last one paid.
    setBillAlert(hh.id, id, 'payment_failed', null, db);
    b = getBill(hh.id, id, db)!;
    expect(b.instalments.map((i) => !!i.paidToProviderAt)).toEqual([true, true, false, false]);
  });

  it('can switch back to paying in full until money has changed hands', () => {
    const { hh, kim, rates } = setup();
    const id = setPaymentPlan(hh.id, rates().id, 'instalments', db, TODAY).id;
    let b = setPaymentPlan(hh.id, id, 'full', db, TODAY);
    expect(b.paymentPlan).toBe('full');
    expect(b.shares.every((s) => s.instalment === 0)).toBe(true);
    expect(b.dueDate).toBe('2026-09-30');

    b = setPaymentPlan(hh.id, id, 'instalments', db, TODAY);
    const share = b.shares.find((s) => s.memberId === kim.id)!;
    setSharePaid(hh.id, share.id, true, {}, db);
    expect(() => setPaymentPlan(hh.id, id, 'full', db, TODAY)).toThrow(/locked/);
    setSharePaid(hh.id, share.id, false, {}, db);
    setInstalmentPaid(hh.id, id, 1, true, db);
    expect(() => setPaymentPlan(hh.id, id, 'full', db, TODAY)).toThrow(/Undo it first/);
  });

  it('keeps amount and due date tied to the instalments while paying by them', () => {
    const { hh, rates } = setup();
    const id = setPaymentPlan(hh.id, rates().id, 'instalments', db, TODAY).id;
    expect(() => updateBill(hh.id, id, { amountMinor: 190000 }, db)).toThrow(/instalments/);
    const b = updateBill(hh.id, id, { notes: 'Paid by BPAY', dueDate: '2026-09-30' }, db);
    expect(b.notes).toBe('Paid by BPAY');
    expect(b.shares).toHaveLength(8);
    // Paying in full, an edit changes the pay-in-full option too.
    setPaymentPlan(hh.id, id, 'full', db, TODAY);
    const full = updateBill(hh.id, id, { amountMinor: 190000 }, db);
    expect(full.fullAmountMinor).toBe(190000);
  });

  it('refuses a plan on a bill that offers no instalments', () => {
    const { hh, svc } = setup();
    const plain = createBill(
      hh.id,
      {
        serviceId: svc.id,
        amountMinor: 1000,
        periodStart: '2026-07-01',
        periodEnd: '2026-07-31',
        dueDate: '2026-08-14',
        source: 'manual',
      },
      db,
    );
    expect(plain.instalments).toEqual([]);
    expect(() => setPaymentPlan(hh.id, plain.id, 'instalments', db, TODAY)).toThrow(/instalments/);
  });

  it('is settled instalment by instalment when the provider takes payment automatically', () => {
    const { hh, svc, rates } = setup();
    updateService(hh.id, svc.id, { autoPay: true }, db);
    const id = setPaymentPlan(hh.id, rates().id, 'instalments', db, TODAY).id;
    settleAutoPaidBills(new Date('2026-12-05T00:00:00Z'), db);
    const b = getBill(hh.id, id, db)!;
    expect(b.instalments.map((i) => i.paidToProviderAt)).toEqual([
      '2026-09-30T00:00:00Z',
      '2026-11-30T00:00:00Z',
      null,
      null,
    ]);
    expect(b.dueDate).toBe('2027-03-01');
    expect(b.paidToProviderAt).toBeNull();
  });

  it('can only switch to paying in full until the pay-in-full date', () => {
    const { hh, rates } = setup();
    const id = setPaymentPlan(hh.id, rates().id, 'instalments', db, TODAY).id;
    expect(() => setPaymentPlan(hh.id, id, 'full', db, '2026-10-01')).toThrow(/has passed/);
    expect(setPaymentPlan(hh.id, id, 'full', db, '2026-09-30').paymentPlan).toBe('full');
    // Nobody chose in time: instalments is still open, paying in full isn't.
    const late = rates().id;
    expect(() => setPaymentPlan(hh.id, late, 'full', db, '2026-10-01')).toThrow(/has passed/);
    expect(setPaymentPlan(hh.id, late, 'instalments', db, '2026-10-01').paymentPlan).toBe(
      'instalments',
    );
  });
});

describe('the bills list', () => {
  it('lists a bill paid by instalments once per instalment, in the month each is due', () => {
    const { hh, rates } = setup();
    const id = setPaymentPlan(hh.id, rates().id, 'instalments', db, TODAY).id;
    setInstalmentPaid(hh.id, id, 1, true, db, '2026-09-18T00:00:00Z');
    const ctx = { locale: 'en-AU', today: '2026-12-05' };
    const all = listBills(hh.id, {}, db);
    const { entries, bills } = filterBills(all, {}, ctx);
    expect(bills).toHaveLength(1);
    expect(
      entries.map((e) => [e.date.slice(0, 7), e.amountMinor, !!e.paidAt, e.instalment]),
    ).toEqual([
      ['2026-09', 50000, true, { seq: 1, of: 4 }],
      ['2026-11', 50000, false, { seq: 2, of: 4 }],
      ['2027-03', 50000, false, { seq: 3, of: 4 }],
      ['2027-05', 50035, false, { seq: 4, of: 4 }],
    ]);
    // Each instalment has its own status and year.
    expect(filterBills(all, { status: 'overdue' }, ctx).entries.map((e) => e.key)).toEqual([
      `${id}:2`,
    ]);
    expect(filterBills(all, { status: 'paid' }, ctx).entries).toHaveLength(1);
    expect(filterBills(all, { year: '2027' }, ctx).entries).toHaveLength(2);
    expect(filterBills(all, { q: 'rates march' }, ctx).entries.map((e) => e.key)).toContain(
      `${id}:3`,
    );
    // Each instalment's shares are counted on their own.
    expect(all[0]!.sharesByInstalment[2]).toEqual({ count: 2, paid: 1 });
  });

  it('lists a bill paid in full once, in the month it belongs to', () => {
    const { hh, rates } = setup();
    rates();
    const { entries } = filterBills(
      listBills(hh.id, {}, db),
      {},
      {
        locale: 'en-AU',
        today: TODAY,
      },
    );
    expect(entries.map((e) => [e.date, e.amountMinor, e.instalment])).toEqual([
      ['2026-08-11', 200035, null],
    ]);
  });
});
