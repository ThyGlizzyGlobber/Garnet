/** Calendar-date helpers. Dates are YYYY-MM-DD strings; arithmetic is done in UTC to avoid DST drift. */

const DAY_MS = 86_400_000;

export function isIsoDate(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));
}

export function toUtcMs(date: string): number {
  return Date.parse(`${date}T00:00:00Z`);
}

export function fromUtcMs(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** Inclusive day count of [start, end]. */
export function daysInclusive(start: string, end: string): number {
  return Math.round((toUtcMs(end) - toUtcMs(start)) / DAY_MS) + 1;
}

/** Inclusive overlap in days between [aStart, aEnd] and [bStart, bEnd ?? ∞]. */
export function overlapDays(
  aStart: string,
  aEnd: string,
  bStart: string,
  bEnd: string | null | undefined,
): number {
  const start = Math.max(toUtcMs(aStart), toUtcMs(bStart));
  const end = Math.min(toUtcMs(aEnd), bEnd ? toUtcMs(bEnd) : Number.POSITIVE_INFINITY);
  if (end < start) return 0;
  return Math.round((end - start) / DAY_MS) + 1;
}

export function addDays(date: string, days: number): string {
  return fromUtcMs(toUtcMs(date) + days * DAY_MS);
}

/** Today's calendar date in the given IANA timezone. */
export function todayIn(timeZone: string, now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/** YYYY-MM of a date. */
export function monthOf(date: string): string {
  return date.slice(0, 7);
}
