import { addDays, daysInclusive, monthOf, toUtcMs } from './dates';

/** First and last day (inclusive) of a YYYY-MM month. */
export function monthBounds(month: string): { start: string; end: string } {
  const [y, m] = month.split('-').map(Number) as [number, number];
  const start = `${month}-01`;
  const end = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  return { start, end };
}

export function addMonths(month: string, n: number): string {
  const [y, m] = month.split('-').map(Number) as [number, number];
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return d.toISOString().slice(0, 7);
}

/** The n months ending at `endMonth`, oldest first. */
export function lastMonths(endMonth: string, n: number): string[] {
  return Array.from({ length: n }, (_, i) => addMonths(endMonth, i - (n - 1)));
}

/** Fiscal year containing `date`, given the month (1–12) the year starts in. */
export function fiscalYearBounds(
  date: string,
  startMonth: number,
): { start: string; end: string; label: string } {
  const y = Number(date.slice(0, 4));
  const m = Number(date.slice(5, 7));
  const startYear = m >= startMonth ? y : y - 1;
  const start = `${startYear}-${String(startMonth).padStart(2, '0')}-01`;
  const endMonth = addMonths(`${startYear}-${String(startMonth).padStart(2, '0')}`, 11);
  const end = monthBounds(endMonth).end;
  const label =
    startMonth === 1 ? String(startYear) : `${startYear}–${String(startYear + 1).slice(2)}`;
  return { start, end, label };
}

export interface MonthAllocation {
  month: string;
  minor: number;
  days: number;
}

/**
 * Spread a bill's amount across the calendar months its billing period covers,
 * pro-rata by days, so a quarterly bill shows up as three months of cost.
 * Rounding remainder goes to the last month so allocations sum exactly.
 */
export function allocateToMonths(
  amountMinor: number,
  periodStart: string,
  periodEnd: string,
): MonthAllocation[] {
  const total = daysInclusive(periodStart, periodEnd);
  if (total <= 0) return [];
  const out: MonthAllocation[] = [];
  let cursor = periodStart;
  while (toUtcMs(cursor) <= toUtcMs(periodEnd)) {
    const month = monthOf(cursor);
    const { end } = monthBounds(month);
    const segmentEnd = toUtcMs(end) < toUtcMs(periodEnd) ? end : periodEnd;
    const days = daysInclusive(cursor, segmentEnd);
    out.push({ month, days, minor: Math.floor((amountMinor * days) / total) });
    cursor = addDays(segmentEnd, 1);
  }
  const allocated = out.reduce((s, a) => s + a.minor, 0);
  const last = out[out.length - 1];
  if (last) last.minor += amountMinor - allocated;
  return out;
}

/** Days between two dates, negative when `to` is before `from`. */
export function daysUntil(from: string, to: string): number {
  return Math.round((toUtcMs(to) - toUtcMs(from)) / 86_400_000);
}
