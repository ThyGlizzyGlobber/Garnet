import type { BillListItem } from '@/lib/bills';
import { billDate, billMonth } from '@/lib/bill-month';
import { paysByInstalments } from '@/lib/instalments';
import { minorUnitDigits } from '@/lib/format';
import { amountWords, matchesAll, monthWords, searchTokens } from '@/lib/search';

export interface BillFilters {
  /** Free text from the search box. */
  q?: string;
  status?: 'all' | 'unpaid' | 'overdue' | 'unusual' | 'paid';
  serviceId?: string | null;
  /** YYYY. */
  year?: string | null;
}

/** Everything a person might type to find a bill, lower case. */
function billHaystack(b: BillListItem, locale: string, today: string): string {
  const digits = minorUnitDigits(b.currency);
  // The bill's own month, and every month its period covers (a quarterly bill
  // for Jul–Sep turns up for "August").
  const months = new Set([billMonth(b), ...monthsBetween(b.periodStart, b.periodEnd)]);
  const overdue = !b.paidToProviderAt && b.dueDate < today;
  return [
    b.service.name,
    b.service.provider,
    b.service.type.label,
    b.service.type.slug,
    b.externalRef ?? '',
    b.notes ?? '',
    b.usageUnit ?? '',
    ...amountWords(b.amountMinor, digits),
    ...[...months].flatMap((m) => monthWords(m, locale)),
    b.paidToProviderAt ? 'paid' : 'unpaid',
    overdue ? 'overdue late' : '',
    b.isAnomaly ? 'unusual' : '',
    b.alertKind ? 'flagged problem failed' : '',
    b.service.autoPay ? 'automatic auto-pay direct debit' : '',
  ]
    .join(' ')
    .toLowerCase();
}

/**
 * One line in the bills list. A bill paid by instalments is listed once per
 * instalment, in the month that instalment is due, with its own amount and
 * payment; any other bill is one entry in the month it belongs to.
 */
export interface BillEntry {
  bill: BillListItem;
  /** Unique within the list: the bill id, plus the instalment number. */
  key: string;
  /** The date it's filed under (YYYY-MM-DD). */
  date: string;
  amountMinor: number;
  dueDate: string;
  /** Paid to the provider. */
  paidAt: string | null;
  instalment: { seq: number; of: number } | null;
}

export function billEntries(b: BillListItem): BillEntry[] {
  if (!paysByInstalments(b))
    return [
      {
        bill: b,
        key: b.id,
        date: billDate(b),
        amountMinor: b.amountMinor,
        dueDate: b.dueDate,
        paidAt: b.paidToProviderAt,
        instalment: null,
      },
    ];
  return b.instalments.map((i) => ({
    bill: b,
    key: `${b.id}:${i.seq}`,
    date: i.dueDate,
    amountMinor: i.amountMinor,
    dueDate: i.dueDate,
    paidAt: i.paidToProviderAt,
    instalment: { seq: i.seq, of: b.instalments.length },
  }));
}

export const entryOverdue = (e: BillEntry, today: string): boolean =>
  !e.paidAt && e.dueDate < today;

/**
 * The list entries (see BillEntry) that pass every filter, the bills they come
 * from, and the words to highlight in them.
 */
export function filterBills(
  bills: BillListItem[],
  f: BillFilters,
  ctx: { locale: string; today: string },
): { bills: BillListItem[]; entries: BillEntry[]; tokens: string[] } {
  const tokens = searchTokens(f.q ?? '');
  const entries = bills.flatMap(billEntries).filter((e) => {
    const b = e.bill;
    if (f.serviceId && b.serviceId !== f.serviceId) return false;
    if (f.year && e.date.slice(0, 4) !== f.year) return false;
    if (f.status === 'unpaid' && e.paidAt) return false;
    if (f.status === 'paid' && !e.paidAt) return false;
    if (f.status === 'overdue' && !entryOverdue(e, ctx.today)) return false;
    if (f.status === 'unusual' && !b.isAnomaly) return false;
    if (!tokens.length) return true;
    const hay = `${billHaystack(b, ctx.locale, ctx.today)} ${monthWords(e.date.slice(0, 7), ctx.locale).join(' ')}${e.instalment ? ' instalment' : ''}`;
    return matchesAll(hay.toLowerCase(), tokens);
  });
  const out = [...new Set(entries.map((e) => e.bill))];
  return { bills: out, entries, tokens };
}

/** YYYY-MM for each month from start to end, at most 13. */
function monthsBetween(start: string, end: string): string[] {
  const out: string[] = [];
  let [y, m] = start.slice(0, 7).split('-').map(Number) as [number, number];
  const last = end.slice(0, 7);
  while (out.length < 13) {
    const key = `${y}-${String(m).padStart(2, '0')}`;
    out.push(key);
    if (key >= last) break;
    m = m === 12 ? 1 : m + 1;
    if (m === 1) y++;
  }
  return out;
}
