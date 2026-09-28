import { daysInclusive, toUtcMs } from './dates';

export interface AnomalyInput {
  amountMinor: number;
  periodStart: string;
  periodEnd: string;
}

export type AnomalyBasis = 'last_year' | 'recent' | 'seasonal_allowance';

export interface AnomalyResult {
  isAnomaly: boolean;
  /** This bill's per-day cost over the baseline, e.g. 1.38 = 38% higher. */
  ratio: number | null;
  /** The per-day cost it was compared with. */
  medianPerDay: number | null;
  /** What the baseline was: the same time last year, or recent bills. */
  basis: AnomalyBasis | null;
}

/** Minimum number of prior bills before we call anything unusual. */
export const ANOMALY_MIN_HISTORY = 2;
/** Flag when a bill's daily cost exceeds the baseline by this factor (or is below 1/factor). */
export const ANOMALY_THRESHOLD = 1.3;
/**
 * A seasonal service with no bill from the same time last year: winter can
 * honestly cost far more than autumn, so only a much bigger change is flagged.
 */
export const SEASONAL_ALLOWANCE = 1.75;
/** A last-year bill counts as "the same time" when its middle is within this many days. */
const SAME_TIME_DAYS = 45;
/** Year-on-year drift is bounded so one odd bill can't distort the baseline. */
const DRIFT_BOUNDS = [0.8, 1.25] as const;

const DAY_MS = 86_400_000;

function perDay(b: AnomalyInput): number {
  return b.amountMinor / Math.max(1, daysInclusive(b.periodStart, b.periodEnd));
}

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;
const midpoint = (b: AnomalyInput) => (toUtcMs(b.periodStart) + toUtcMs(b.periodEnd)) / 2;

/**
 * Is a bill's cost per day out of the ordinary for its service?
 *
 * 1. When there's a bill (or bills) from the same time last year, compare with
 *    those, adjusted for how the service has drifted since (its last three
 *    bills against the three before last year's). Seasons cancel out.
 * 2. Otherwise compare with the median of earlier bills: ±30% for ordinary
 *    services, ±75% for seasonal ones (electricity, gas), whose winter can
 *    honestly cost far more than their autumn.
 *
 * Cost per day, so a quarterly bill after monthly ones still compares sensibly.
 * Needs ANOMALY_MIN_HISTORY earlier bills.
 */
export function detectAnomaly(
  bill: AnomalyInput,
  priors: AnomalyInput[],
  opts: { seasonal?: boolean } = {},
): AnomalyResult {
  const none: AnomalyResult = { isAnomaly: false, ratio: null, medianPerDay: null, basis: null };
  const earlier = priors
    .filter((p) => p.periodStart < bill.periodStart)
    .sort((a, b) => a.periodStart.localeCompare(b.periodStart));
  if (earlier.length < ANOMALY_MIN_HISTORY) return none;
  const own = perDay(bill);

  const target = midpoint(bill) - 365 * DAY_MS;
  const lastYear = earlier.filter((p) => Math.abs(midpoint(p) - target) <= SAME_TIME_DAYS * DAY_MS);
  if (lastYear.length) {
    const firstLastYear = earlier.indexOf(lastYear[0]!);
    const recent = earlier.slice(-3);
    const before = earlier.slice(Math.max(0, firstLastYear - 3), firstLastYear);
    const rawDrift = before.length ? mean(recent.map(perDay)) / mean(before.map(perDay)) : 1;
    const drift = Math.min(DRIFT_BOUNDS[1], Math.max(DRIFT_BOUNDS[0], rawDrift || 1));
    const baseline = mean(lastYear.map(perDay)) * drift;
    if (baseline <= 0) return none;
    const ratio = own / baseline;
    return {
      isAnomaly: ratio >= ANOMALY_THRESHOLD || ratio <= 1 / ANOMALY_THRESHOLD,
      ratio,
      medianPerDay: baseline,
      basis: 'last_year',
    };
  }

  const baseline = median(earlier.map(perDay));
  if (baseline <= 0) return { ...none, medianPerDay: baseline };
  const ratio = own / baseline;
  const factor = opts.seasonal ? SEASONAL_ALLOWANCE : ANOMALY_THRESHOLD;
  return {
    isAnomaly: ratio >= factor || ratio <= 1 / factor,
    ratio,
    medianPerDay: baseline,
    basis: opts.seasonal ? 'seasonal_allowance' : 'recent',
  };
}

/** The Unusual note, saying what the bill was compared with. */
export function anomalyNote(ratio: number, basis: AnomalyBasis = 'recent'): string {
  const pct = Math.round(Math.abs(ratio - 1) * 100);
  const dir = ratio >= 1 ? 'above' : 'below';
  if (basis === 'last_year') return `${pct}% ${dir} the same time last year`;
  if (basis === 'seasonal_allowance')
    return `${pct}% ${dir} your recent bills, more than the seasons usually explain (no bill from the same time last year yet)`;
  return `${pct}% ${dir} your usual daily cost for this service`;
}
