import { daysInclusive, toUtcMs } from './dates';

/**
 * Small shared maths for comparing bills: cost per day (so a quarterly bill
 * compares fairly with monthly ones), averages, and "the same time last year".
 */

/** A change smaller than this (2%) reads as "about the same" / "level" everywhere. */
export const SAME_BAND = 0.02;

export const mean = (xs: number[]): number => xs.reduce((s, x) => s + x, 0) / xs.length;

export function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

type Period = { periodStart: string; periodEnd: string };

/** A bill's cost per day of its period, in minor units. */
export function costPerDay(b: Period & { amountMinor: number }): number {
  return b.amountMinor / Math.max(1, daysInclusive(b.periodStart, b.periodEnd));
}

/** The middle of a period, as a UTC timestamp. */
const midpoint = (p: Period): number => (toUtcMs(p.periodStart) + toUtcMs(p.periodEnd)) / 2;

const DAY_MS = 86_400_000;
/** A period counts as "the same time last year" when its middle is within this many days. */
const SAME_TIME_DAYS = 45;

/** How far a period's middle is from a year before `of`'s, in ms. */
function offYear(of: Period, p: Period): number {
  return Math.abs(midpoint(p) - (midpoint(of) - 365 * DAY_MS));
}

/** The periods from the same time a year before `of` (middles within six weeks), in their order. */
export function sameTimeLastYear<T extends Period>(of: Period, periods: T[]): T[] {
  return periods.filter((p) => offYear(of, p) <= SAME_TIME_DAYS * DAY_MS);
}

/** Of those, the one closest to exactly a year before `of`. */
export function closestYearBefore<T extends Period>(of: Period, periods: T[]): T | undefined {
  return sameTimeLastYear(of, periods).sort((a, b) => offYear(of, a) - offYear(of, b))[0];
}
