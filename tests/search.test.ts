import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { openDb, type Db } from '@/db/client';
import { runMigrations } from '@/db/migrate';
import { archiveDocument } from '@/ingest/archive';
import { processDocument } from '@/ingest/pipeline';
import { billDate, billMonth } from '@/lib/bill-month';
import { filterBills } from '@/lib/bill-search';
import { createBill, listBills } from '@/lib/bills';
import { createHousehold } from '@/lib/households';
import { createMember } from '@/lib/members';
import { listDocuments, searchDocuments } from '@/lib/review';
import { amountWords, searchTokens } from '@/lib/search';
import { createService } from '@/lib/services';
import { scriptAi, type AiOutput } from './helpers/fake-ai';

let dir: string;
let db: Db;
let close: () => void;

beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hud-search-'));
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

const TODAY = '2026-09-28';
const ctx = { locale: 'en-AU', today: TODAY };

let n = 0;
function household() {
  const hh = createHousehold(
    {
      name: `Search ${++n}`,
      currency: 'AUD',
      locale: 'en-AU',
      timezone: 'Australia/Melbourne',
      fiscalYearStartMonth: 7,
      splitMode: 'shared',
    },
    db,
  );
  const jo = createMember(hh.id, { name: 'Jo', role: 'owner', activeFrom: '2025-01-01' }, db);
  const svc = (typeSlug: string, name: string, provider: string) =>
    createService(hh.id, { typeSlug, name, provider, payerMemberId: jo.id }, db);
  return {
    hh,
    internet: svc('internet', 'Internet', 'Aussie Broadband'),
    power: svc('electricity', 'Electricity', 'Red Energy'),
  };
}

describe('the month a bill belongs to', () => {
  it('is the issue date, else the period start when billed in advance, else the period end', () => {
    const base = { periodStart: '2026-07-14', periodEnd: '2026-08-13' };
    expect(billMonth({ ...base, issueDate: '2026-07-14', dueDate: '2026-07-26' })).toBe('2026-07');
    // Internet, billed in advance: due before the period ends.
    expect(billDate({ ...base, issueDate: null, dueDate: '2026-07-26' })).toBe('2026-07-14');
    // Electricity, billed in arrears: due after the period ends.
    expect(
      billDate({
        issueDate: null,
        periodStart: '2026-06-01',
        periodEnd: '2026-08-31',
        dueDate: '2026-09-20',
      }),
    ).toBe('2026-08-31');
  });
});

describe('search words', () => {
  it('drop currency signs and thousands separators, and read amounts every way', () => {
    expect(searchTokens('  $1,234.50  AGL #123 ')).toEqual(['1234.50', 'agl', '123']);
    expect(amountWords(12900, 2)).toEqual(['129.00', '129.00', '129']);
    expect(amountWords(123450, 2)).toEqual(['1234.50', '1,234.50']);
  });
});

describe('finding bills', () => {
  function setup() {
    const { hh, internet, power } = household();
    const bill = (
      serviceId: string,
      amountMinor: number,
      start: string,
      end: string,
      due: string,
      ref: string,
      paid = false,
    ) =>
      createBill(
        hh.id,
        {
          serviceId,
          amountMinor,
          periodStart: start,
          periodEnd: end,
          dueDate: due,
          externalRef: ref,
          source: 'manual',
          paidToProviderAt: paid ? `${due}T00:00:00Z` : null,
        },
        db,
      );
    bill(internet.id, 12900, '2026-07-14', '2026-08-13', '2026-07-26', '60097874', true);
    bill(internet.id, 12900, '2026-08-14', '2026-09-13', '2026-08-26', '61111111');
    bill(power.id, 41250, '2026-06-01', '2026-08-31', '2026-09-20', 'RE-9981');
    bill(power.id, 38800, '2025-06-01', '2025-08-31', '2025-09-20', 'RE-5500', true);
    return { hh, internet, power, all: listBills(hh.id, {}, db) };
  }
  const refs = (bills: { externalRef: string | null }[]) => bills.map((b) => b.externalRef).sort();

  it('by provider, month name, amount and invoice number, every word counting', () => {
    const { all } = setup();
    expect(refs(filterBills(all, { q: 'aussie' }, ctx).bills)).toEqual(['60097874', '61111111']);
    expect(refs(filterBills(all, { q: 'august 2026' }, ctx).bills)).toEqual([
      '60097874', // Jul 14 – Aug 13 covers August
      '61111111',
      'RE-9981',
    ]);
    expect(refs(filterBills(all, { q: '$412.50' }, ctx).bills)).toEqual(['RE-9981']);
    expect(refs(filterBills(all, { q: '129' }, ctx).bills)).toEqual(['60097874', '61111111']);
    expect(refs(filterBills(all, { q: '6009' }, ctx).bills)).toEqual(['60097874']);
    expect(refs(filterBills(all, { q: 'red energy 2025' }, ctx).bills)).toEqual(['RE-5500']);
    // A quarterly bill turns up for the month in the middle of its period.
    expect(refs(filterBills(all, { q: 'red july 2026' }, ctx).bills)).toEqual(['RE-9981']);
    expect(filterBills(all, { q: 'aussie overdue' }, ctx).bills).toHaveLength(1);
    expect(filterBills(all, { q: 'nothing like this' }, ctx).bills).toHaveLength(0);
  });

  it('by service, year and status, combined with a search', () => {
    const { all, power } = setup();
    expect(refs(filterBills(all, { serviceId: power.id }, ctx).bills)).toEqual([
      'RE-5500',
      'RE-9981',
    ]);
    expect(refs(filterBills(all, { year: '2025' }, ctx).bills)).toEqual(['RE-5500']);
    expect(refs(filterBills(all, { status: 'paid' }, ctx).bills)).toEqual(['60097874', 'RE-5500']);
    expect(
      refs(filterBills(all, { status: 'unpaid', serviceId: power.id, q: 'red' }, ctx).bills),
    ).toEqual(['RE-9981']);
    expect(filterBills(all, { q: 'Aussie  129' }, ctx).tokens).toEqual(['aussie', '129']);
  });
});

describe('the inbox by month', () => {
  const receipt = (date: string): AiOutput => ({
    document_type: 'payment_receipt',
    provider: 'Aussie Broadband',
    document_date: date,
    service_type: 'internet',
    bill: null,
    payment: { date, amount: 129, currency: 'AUD', invoice_numbers: ['1'] },
    page_rotation: [],
    confidence: 0.95,
    notes: null,
  });

  it('files an old bill forwarded today under its own month, and a receipt under its printed date', async () => {
    const { hh } = household();
    const upload = (text: string) =>
      archiveDocument(
        hh.id,
        {
          kind: 'upload',
          buffer: Buffer.from(`${text} ${Math.random()}`),
          originalFilename: 'doc.txt',
          mimeType: 'text/plain',
          receivedAt: '2026-09-28T01:00:00Z',
        },
        db,
      ).doc;
    scriptAi(null); // the stand-in reads the Aussie invoice fixture as the June 2026 bill
    const invoice = upload(
      fs.readFileSync(path.join(process.cwd(), 'tests/fixtures/aussie-broadband.txt'), 'utf8'),
    );
    await processDocument(hh.id, invoice.id, db);
    scriptAi(receipt('2026-07-28'));
    const paid = upload('A payment receipt from Aussie Broadband with enough text to read.');
    await processDocument(hh.id, paid.id, db);
    scriptAi(null);
    const docs = listDocuments(hh.id, {}, db);
    const byId = new Map(docs.map((d) => [d.id, d.date]));
    expect(byId.get(invoice.id)).toBe('2026-06-14'); // issue date, not 28 Sep
    expect(byId.get(paid.id)).toBe('2026-07-28');
    expect(docs.map((d) => d.id)).toEqual([paid.id, invoice.id]); // newest month first

    expect(searchDocuments(docs, 'june', 'en-AU').docs.map((d) => d.id)).toEqual([invoice.id]);
    expect(searchDocuments(docs, 'receipt july', 'en-AU').docs.map((d) => d.id)).toEqual([paid.id]);
  });
});
