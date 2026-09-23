import { daysInclusive } from './dates';

export interface AnomalyInput {
  amountMinor: number;
  periodStart: string;
  periodEnd: string;
}

export interface AnomalyResult {
  isAnomaly: boolean;
  /** Ratio of this bill's per-day cost to the median of prior bills, e.g. 1.38 = 38% higher. */
  ratio: number | null;
  medianPerDay: number | null;
}

/** Minimum number of prior bills before we call anything unusual. */
export const ANOMALY_MIN_HISTORY = 2;
/** Flag when a bill's daily cost exceeds the prior median by this factor (or is below 1/factor). */
export const ANOMALY_THRESHOLD = 1.3;

function perDay(b: AnomalyInput): number {
  return b.amountMinor / Math.max(1, daysInclusive(b.periodStart, b.periodEnd));
}

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

/**
 * Compare a bill's cost per day against the median of earlier bills for the
 * same service. Cadence-agnostic, so a quarterly bill after monthly ones still
 * compares sensibly. Requires ANOMALY_MIN_HISTORY prior bills.
 */
export function detectAnomaly(bill: AnomalyInput, priors: AnomalyInput[]): AnomalyResult {
  if (priors.length < ANOMALY_MIN_HISTORY)
    return { isAnomaly: false, ratio: null, medianPerDay: null };
  const medianPerDay = median(priors.map(perDay));
  if (medianPerDay <= 0) return { isAnomaly: false, ratio: null, medianPerDay };
  const ratio = perDay(bill) / medianPerDay;
  const isAnomaly = ratio >= ANOMALY_THRESHOLD || ratio <= 1 / ANOMALY_THRESHOLD;
  return { isAnomaly, ratio, medianPerDay };
}

export function anomalyNote(ratio: number): string {
  const pct = Math.round(Math.abs(ratio - 1) * 100);
  return ratio >= 1
    ? `${pct}% above your usual daily cost for this service`
    : `${pct}% below your usual daily cost for this service`;
}
