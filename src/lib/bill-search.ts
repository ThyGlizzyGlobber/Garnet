import type { BillListItem } from '@/lib/bills';
import { billDate, billMonth } from '@/lib/bill-month';
import { dueNow, paysByInstalments } from '@/lib/instalments';
import { minorUnitDigits } from '@/lib/format';
import { amountWords, matchesAll, monthWords, searchTokens } from '@/lib/search';

export interface BillFilters {
  /** Free text from the search box. */
  q?: string;
  status?: 'all' | 'unpaid' | 'overdue' | 'unusual' | 'paid';
  serviceId?: string | null;
  /** YYYY. */
  year?: string | null;
  /**
   * Which months: up to and including this one (the default), or the months
   * after it (bills issued ahead, instalments not due yet), or every month.
   */
  when?: 'now' | 'upcoming' | 'all';
  /** Every sub-service of a main service (Subscriptions), by type slug. */
  typeSlug?: string | null;
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
 * One line in the bills list: a bill is listed once, in the month it belongs
 * to, whatever it is paid by (D2). By instalments, the line carries the next
 * instalment's amount and date, and the bill is paid once every instalment is.
 */
export interface BillEntry {
  bill: BillListItem;
  /** The date it's filed under (YYYY-MM-DD). */
  date: string;
  /** What is due to the provider next: the next instalment, or the bill. */
  amountMinor: number;
  dueDate: string;
  /** Paid to the provider (every instalment, or the bill). */
  paidAt: string | null;
  /** The next unpaid instalment (or the last one, once all are paid). */
  instalment: { seq: number; of: number } | null;
}

const entryOverdue = (e: BillEntry, today: string): boolean => !e.paidAt && e.dueDate < today;

export function billEntry(b: BillListItem): BillEntry {
  const due = dueNow(b);
  const byInstalments = paysByInstalments(b);
  const paidAt = byInstalments
    ? b.instalments.every((i) => i.paidToProviderAt)
      ? (b.instalments.at(-1)!.paidToProviderAt ?? b.paidToProviderAt)
      : null
    : b.paidToProviderAt;
  return {
    bill: b,
    date: billDate(b),
    amountMinor: due.amountMinor,
    dueDate: due.dueDate,
    paidAt,
    instalment: due.seq === null ? null : { seq: due.seq, of: due.of },
  };
}

/**
 * The list entries (see BillEntry) that pass every filter, the bills they come
 * from, and the words to highlight in them.
 */
export function filterBills(
  bills: BillListItem[],
  f: BillFilters,
  ctx: { locale: string; today: string },
): { bills: BillListItem[]; entries: BillEntry[]; tokens: string[]; later: number } {
  const tokens = searchTokens(f.q ?? '');
  const thisMonth = ctx.today.slice(0, 7);
  const isLater = (e: BillEntry) => e.date.slice(0, 7) > thisMonth;
  const when = f.when ?? 'now';
  const passing = bills.map(billEntry).filter((e) => {
    const b = e.bill;
    if (f.serviceId && b.serviceId !== f.serviceId) return false;
    if (f.typeSlug && b.service.typeSlug !== f.typeSlug) return false;
    if (f.year && e.date.slice(0, 4) !== f.year) return false;
    if (f.status === 'unpaid' && e.paidAt) return false;
    if (f.status === 'paid' && !e.paidAt) return false;
    if (f.status === 'overdue' && !entryOverdue(e, ctx.today)) return false;
    if (f.status === 'unusual' && !b.isAnomaly) return false;
    if (!tokens.length) return true;
    const hay = `${billHaystack(b, ctx.locale, ctx.today)} ${monthWords(e.date.slice(0, 7), ctx.locale).join(' ')}${b.instalments.length ? ' instalment instalments' : ''}`;
    return matchesAll(hay.toLowerCase(), tokens);
  });
  const entries = passing.filter((e) =>
    when === 'all' ? true : when === 'upcoming' ? isLater(e) : !isLater(e),
  );
  const out = [...new Set(entries.map((e) => e.bill))];
  // Entries in later months that every other filter lets through.
  return { bills: out, entries, tokens, later: passing.filter(isLater).length };
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
