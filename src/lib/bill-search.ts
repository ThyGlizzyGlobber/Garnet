import type { BillListItem } from '@/lib/bills';
import { billMonth } from '@/lib/bill-month';
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
export function billHaystack(b: BillListItem, locale: string, today: string): string {
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

/** The bills that pass every filter, and the words to highlight in them. */
export function filterBills(
  bills: BillListItem[],
  f: BillFilters,
  ctx: { locale: string; today: string },
): { bills: BillListItem[]; tokens: string[] } {
  const tokens = searchTokens(f.q ?? '');
  const out = bills.filter((b) => {
    if (f.serviceId && b.serviceId !== f.serviceId) return false;
    if (f.year && billMonth(b).slice(0, 4) !== f.year) return false;
    const overdue = !b.paidToProviderAt && b.dueDate < ctx.today;
    if (f.status === 'unpaid' && b.paidToProviderAt) return false;
    if (f.status === 'paid' && !b.paidToProviderAt) return false;
    if (f.status === 'overdue' && !overdue) return false;
    if (f.status === 'unusual' && !b.isAnomaly) return false;
    return !tokens.length || matchesAll(billHaystack(b, ctx.locale, ctx.today), tokens);
  });
  return { bills: out, tokens };
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
