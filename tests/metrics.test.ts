import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { openDb, type Db } from '@/db/client';
import { bill as billTable } from '@/db/schema';
import { runMigrations } from '@/db/migrate';
import { archiveDocument, setDocumentStatus } from '@/ingest/archive';
import { documentsMissingDates, readMissingMetrics } from '@/ingest/metrics';
import { processDocument } from '@/ingest/pipeline';
import { createBill } from '@/lib/bills';
import { createHousehold } from '@/lib/households';
import { createMember } from '@/lib/members';
import { billsMissingMetrics, listBillMetrics, metricKey, saveBillMetrics } from '@/lib/metrics';
import { listDocuments } from '@/lib/review';
import { createService } from '@/lib/services';
import { scriptAi, type AiOutput } from './helpers/fake-ai';

let dir: string;
let db: Db;
let close: () => void;

beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hud-metrics-'));
  runMigrations(dir);
  const opened = openDb(dir);
  db = opened.db;
  close = () => opened.sqlite.close();
});

afterAll(() => {
  scriptAi(null);
  close();
  fs.rmSync(dir, { recursive: true, force: true });
});

let n = 0;
function setup() {
  const hh = createHousehold(
    {
      name: `Metrics ${++n}`,
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
    { typeSlug: 'electricity', name: 'Electricity', provider: 'Red Energy', payerMemberId: jo.id },
    db,
  );
  return { hh, svc };
}

const electricity = (ref: string): AiOutput => ({
  document_type: 'bill',
  provider: 'Red Energy',
  document_date: null,
  service_type: 'electricity',
  bill: {
    amount: 412.5,
    currency: 'AUD',
    tax_amount: 37.5,
    tax_label: 'GST',
    period_start: '2026-06-01',
    period_end: '2026-08-31',
    issue_date: null,
    due_date: '2026-09-20',
    usage_quantity: 1180,
    usage_unit: 'kWh',
    invoice_number: ref,
    account_number: null,
    auto_pay: false,
    previous_payment: null,
    metrics: [
      {
        key: 'usage_peak',
        label: 'Peak usage',
        kind: 'usage',
        value: 702.4,
        unit: 'kwh',
        amount: null,
        period_start: null,
        period_end: null,
      },
      {
        key: 'usage_off_peak',
        label: 'Off-peak usage',
        kind: 'usage',
        value: 477.6,
        unit: 'kWh',
        amount: null,
        period_start: null,
        period_end: null,
      },
      {
        key: 'rate_peak',
        label: 'Peak rate',
        kind: 'rate',
        value: 0.2953,
        unit: 'AUD/kWh',
        amount: null,
        period_start: null,
        period_end: null,
      },
      {
        key: 'supply_charge',
        label: 'Supply charge',
        kind: 'charge',
        value: null,
        unit: null,
        amount: 98.44,
        period_start: null,
        period_end: null,
      },
      {
        key: 'discount',
        label: 'Pay-on-time discount',
        kind: 'charge',
        value: null,
        unit: null,
        amount: -20.1,
        period_start: null,
        period_end: null,
      },
      {
        key: 'Daily Average Usage',
        label: 'Average per day',
        kind: 'average',
        value: 12.83,
        unit: 'kWh',
        amount: null,
        period_start: null,
        period_end: null,
      },
      {
        key: 'empty',
        label: 'Nothing',
        kind: 'other',
        value: null,
        unit: null,
        amount: null,
        period_start: null,
        period_end: null,
      },
    ],
  },
  payment: null,
  confidence: 0.95,
  notes: null,
});

const upload = (hid: string) =>
  archiveDocument(
    hid,
    {
      kind: 'upload',
      buffer: Buffer.from(`Red Energy electricity bill with plenty of text. ${Math.random()}`),
      originalFilename: 'bill.txt',
      mimeType: 'text/plain',
    },
    db,
  ).doc;

describe('figures from a bill', () => {
  it('are kept with the bill: usage and rates as values, charges in cents', async () => {
    const { hh } = setup();
    scriptAi(electricity('E-1'));
    const outcome = await processDocument(hh.id, upload(hh.id).id, db);
    expect(outcome.status).toBe('extracted');
    const rows = listBillMetrics(hh.id, outcome.billId!, db);
    expect(rows.map((r) => [r.key, r.kind, r.value, r.unit, r.amountMinor, r.currency])).toEqual([
      ['usage_peak', 'usage', 702.4, 'kWh', null, null],
      ['usage_off_peak', 'usage', 477.6, 'kWh', null, null],
      ['rate_peak', 'rate', 0.2953, 'AUD/kWh', null, null],
      ['supply_charge', 'charge', null, null, 9844, 'AUD'],
      ['discount', 'charge', null, null, -2010, 'AUD'],
      ['daily_average_usage', 'average', 12.83, 'kWh', null, null],
    ]);
    expect(billsMissingMetrics(hh.id, db)).toHaveLength(0);
  });

  it('use stable snake_case names', () => {
    expect(metricKey('Peak Usage (kWh)')).toBe('peak_usage_kwh');
    expect(metricKey('  usage-off-peak ')).toBe('usage_off_peak');
  });

  it('are filled in for bills read before figures were kept, once', async () => {
    const { hh, svc } = setup();
    const doc = upload(hh.id);
    const old = createBill(
      hh.id,
      {
        serviceId: svc.id,
        sourceDocumentId: doc.id,
        amountMinor: 41250,
        periodStart: '2026-03-01',
        periodEnd: '2026-05-31',
        dueDate: '2026-06-20',
        source: 'llm',
      },
      db,
    );
    const manual = createBill(
      hh.id,
      {
        serviceId: svc.id,
        amountMinor: 1000,
        periodStart: '2026-03-01',
        periodEnd: '2026-03-31',
        dueDate: '2026-04-20',
        source: 'manual',
      },
      db,
    );
    expect(billsMissingMetrics(hh.id, db).map((b) => b.id)).toEqual([old.id]);
    scriptAi(electricity('E-2'));
    expect(await readMissingMetrics(hh.id, db)).toEqual({ read: 1, withFigures: 1, dated: 0 });
    expect(listBillMetrics(hh.id, old.id, db)).toHaveLength(6);
    expect(listBillMetrics(hh.id, manual.id, db)).toHaveLength(0);
    // The bill itself is untouched, and it isn't read again.
    const after = db.select().from(billTable).where(eq(billTable.id, old.id)).get()!;
    expect(after.amountMinor).toBe(41250);
    expect(await readMissingMetrics(hh.id, db)).toEqual({ read: 0, withFigures: 0, dated: 0 });
  });

  it('date receipts read before dates were kept, once', async () => {
    const { hh } = setup();
    const doc = upload(hh.id);
    setDocumentStatus(
      hh.id,
      doc.id,
      'notice',
      JSON.stringify({
        result: null,
        attempts: [],
        reason: 'Payment receipt from Red Energy',
        textPreview: '',
        processedAt: '',
      }),
      db,
    );
    expect(documentsMissingDates(hh.id, db).map((d) => d.id)).toEqual([doc.id]);
    scriptAi({
      document_type: 'payment_receipt',
      provider: 'Red Energy',
      document_date: '2026-05-03',
      service_type: 'electricity',
      bill: null,
      payment: { date: '2026-05-03', amount: 412.5, currency: 'AUD', invoice_numbers: [] },
      confidence: 0.95,
      notes: null,
    });
    expect(await readMissingMetrics(hh.id, db)).toEqual({ read: 1, withFigures: 0, dated: 1 });
    expect(listDocuments(hh.id, {}, db).find((d) => d.id === doc.id)?.date).toBe('2026-05-03');
    expect(documentsMissingDates(hh.id, db)).toHaveLength(0);
  });

  it('are replaced, not duplicated, when read again', () => {
    const { hh, svc } = setup();
    const b = createBill(
      hh.id,
      {
        serviceId: svc.id,
        amountMinor: 1000,
        periodStart: '2026-03-01',
        periodEnd: '2026-03-31',
        dueDate: '2026-04-20',
        source: 'manual',
      },
      db,
    );
    const one = {
      key: 'usage_total',
      label: 'Total',
      kind: 'usage' as const,
      value: 10,
      unit: 'kWh',
      amountMinor: null,
      currency: null,
      periodStart: null,
      periodEnd: null,
    };
    saveBillMetrics(hh.id, b.id, [one, { ...one, key: 'usage_peak', value: 4 }], db);
    saveBillMetrics(hh.id, b.id, [{ ...one, value: 11 }], db);
    expect(listBillMetrics(hh.id, b.id, db).map((m) => m.value)).toEqual([11]);
  });
});
