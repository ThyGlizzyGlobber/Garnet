import { and, eq, inArray } from 'drizzle-orm';
import { getDb, type Db } from '@/db/client';
import { billMetric, type BillMetric } from '@/db/schema';
import { listBills, type BillListItem } from '@/lib/bills';
import { closestYearBefore, mean } from '@/lib/averages';
import { daysInclusive, toUtcMs } from '@/lib/dates';
import { getService, listServices } from '@/lib/services';
import { convertUnit } from '@/lib/units';

/**
 * Usage over time for a service, and how the latest bill compares: with the
 * previous bill, the same time last year, the average of recent bills, the
 * household's own limit, and similar households (when the bill prints that).
 *
 * Bills cover different lengths (monthly, quarterly), so everything is compared
 * per day. Pure calculations over stored bills and bill figures: no AI calls.
 * Every screen (and the dashboard a designer builds later) reads from here.
 */

/** Days in a month on average, for turning per-day figures into "per month". */
export const DAYS_PER_MONTH = 365 / 12;

interface UsagePart {
  key: string;
  label: string;
  quantity: number;
  perDay: number;
}

export interface UsagePeriod {
  billId: string;
  periodStart: string;
  periodEnd: string;
  days: number;
  /** Total usage in the history's unit, or null when the bill has none. */
  quantity: number | null;
  perDay: number | null;
  costMinor: number;
  currency: string;
  costPerDayMinor: number;
  /** Usage by band or tariff (peak, off-peak, controlled load…), when the bill splits it. */
  parts: UsagePart[];
}

export interface UsageHistory {
  serviceId: string;
  /** Unit every quantity is expressed in (the service's unit when set). */
  unit: string | null;
  /** Oldest first. */
  periods: UsagePeriod[];
}

/** A change from one figure to another; pct is a fraction (0.08 = 8% more), null if from is 0. */
export interface Change {
  from: number;
  to: number;
  pct: number | null;
}

export interface UsageComparison {
  serviceId: string;
  unit: string | null;
  latest: UsagePeriod;
  /** Per day, against the previous bill that had usage. */
  previous: { period: UsagePeriod; usage: Change; cost: Change } | null;
  /** Per day, against the bill covering the same time a year earlier. */
  lastYear: { period: UsagePeriod; usage: Change; cost: Change } | null;
  /** Per day, against the mean of up to four earlier bills. */
  average: { bills: number; usage: Change; cost: Change } | null;
  /** Against the household's monthly limit (compared per day). */
  limit: { monthly: number; perDay: number; usage: Change } | null;
  /** Against the "similar households" figure some providers print. */
  similarHouseholds: Change | null;
}

const change = (from: number, to: number): Change => ({
  from,
  to,
  pct: from === 0 ? null : (to - from) / from,
});

/** Figures that are usage in their own right, not a total or a comparison. */
const isUsagePart = (m: BillMetric) =>
  m.kind === 'usage' && m.value !== null && m.key !== 'usage_total' && m.key !== 'solar_export';

/** A quantity in another unit of the same kind (MJ → kWh). Unknown units are taken as-is. */
function inUnit(quantity: number, from: string | null, to: string | null): number | null {
  if (!from || !to || from === to) return quantity;
  return convertUnit(quantity, from, to);
}

/**
 * A bill's total usage: the headline figure, else a "usage_total" figure, else
 * the sum of its usage bands (peak + off-peak + …).
 */
function totalUsage(b: BillListItem, figures: BillMetric[], unit: string | null): number | null {
  if (b.usageQuantity !== null) return inUnit(b.usageQuantity, b.usageUnit ?? unit, unit);
  const total = figures.find((m) => m.key === 'usage_total' && m.value !== null);
  if (total) return inUnit(total.value!, total.unit, unit);
  const parts = figures.filter(isUsagePart);
  if (!parts.length) return null;
  let sum = 0;
  for (const p of parts) {
    const q = inUnit(p.value!, p.unit, unit);
    if (q === null) return null;
    sum += q;
  }
  return sum;
}

function figuresFor(householdId: string, billIds: string[], db: Db): Map<string, BillMetric[]> {
  const byBill = new Map<string, BillMetric[]>();
  if (!billIds.length) return byBill;
  const rows = db
    .select()
    .from(billMetric)
    .where(and(eq(billMetric.householdId, householdId), inArray(billMetric.billId, billIds)))
    .all();
  for (const r of rows) byBill.set(r.billId, [...(byBill.get(r.billId) ?? []), r]);
  for (const list of byBill.values()) list.sort((a, b) => a.position - b.position);
  return byBill;
}

export function usageHistory(
  householdId: string,
  serviceId: string,
  db: Db = getDb(),
): UsageHistory | null {
  const svc = getService(householdId, serviceId, db);
  if (!svc) return null;
  const bills = listBills(householdId, { serviceId }, db).sort(
    (a, b) => toUtcMs(a.periodEnd) - toUtcMs(b.periodEnd),
  );
  const figures = figuresFor(
    householdId,
    bills.map((b) => b.id),
    db,
  );
  // The service's unit, else whatever the latest bill with usage used.
  const unit = svc.usageUnit ?? [...bills].reverse().find((b) => b.usageUnit)?.usageUnit ?? null;
  const periods = bills.map((b): UsagePeriod => {
    const days = Math.max(1, daysInclusive(b.periodStart, b.periodEnd));
    const own = figures.get(b.id) ?? [];
    const quantity = totalUsage(b, own, unit);
    return {
      billId: b.id,
      periodStart: b.periodStart,
      periodEnd: b.periodEnd,
      days,
      quantity,
      perDay: quantity === null ? null : quantity / days,
      costMinor: b.amountMinor,
      currency: b.currency,
      costPerDayMinor: b.amountMinor / days,
      parts: own
        .filter(isUsagePart)
        .map((m) => ({ key: m.key, label: m.label, q: inUnit(m.value!, m.unit, unit) }))
        .filter((p): p is { key: string; label: string; q: number } => p.q !== null)
        .map((p) => ({ key: p.key, label: p.label, quantity: p.q, perDay: p.q / days })),
    };
  });
  return { serviceId, unit, periods };
}

/** How the latest bill with usage compares. Null when no bill has usage yet. */
export function compareUsage(
  householdId: string,
  serviceId: string,
  db: Db = getDb(),
): UsageComparison | null {
  const history = usageHistory(householdId, serviceId, db);
  if (!history) return null;
  const withUsage = history.periods.filter((p) => p.perDay !== null);
  const latest = withUsage.at(-1);
  if (!latest) return null;
  const earlier = withUsage.slice(0, -1);
  const vs = (p: UsagePeriod) => ({
    period: p,
    usage: change(p.perDay!, latest.perDay!),
    cost: change(p.costPerDayMinor, latest.costPerDayMinor),
  });

  const prev = earlier.at(-1);
  // The bill whose middle falls closest to a year before the latest's, within six weeks.
  const yearAgo = closestYearBefore(latest, earlier);
  const recent = earlier.slice(-4);

  const svc = getService(householdId, serviceId, db);
  const limitPerDay = svc?.usageLimitMonthly ? svc.usageLimitMonthly / DAYS_PER_MONTH : null;

  const latestFigures = figuresFor(householdId, [latest.billId], db).get(latest.billId) ?? [];
  const similar = latestFigures.find(
    (m) => m.key === 'similar_households_usage' && m.value !== null,
  );
  const similarQty = similar ? inUnit(similar.value!, similar.unit, history.unit) : null;

  return {
    serviceId,
    unit: history.unit,
    latest,
    previous: prev ? vs(prev) : null,
    lastYear: yearAgo ? vs(yearAgo) : null,
    average:
      recent.length >= 2
        ? {
            bills: recent.length,
            usage: change(mean(recent.map((p) => p.perDay!)), latest.perDay!),
            cost: change(mean(recent.map((p) => p.costPerDayMinor)), latest.costPerDayMinor),
          }
        : null,
    limit:
      limitPerDay && svc?.usageLimitMonthly
        ? {
            monthly: svc.usageLimitMonthly,
            perDay: limitPerDay,
            usage: change(limitPerDay, latest.perDay!),
          }
        : null,
    // A similar-households figure is for the same period, so compare totals.
    similarHouseholds:
      similarQty !== null && latest.quantity !== null ? change(similarQty, latest.quantity) : null,
  };
}

/** Latest comparison for every active service that has usage (for the dashboard). */
export function householdUsage(householdId: string, db: Db = getDb()): UsageComparison[] {
  return listServices(householdId, {}, db)
    .map((s) => compareUsage(householdId, s.id, db))
    .filter((c): c is UsageComparison => c !== null);
}

/**
 * For each figure on a bill, how it changed since the service's previous bill
 * that had the same figure. Usage and charges are compared per day (periods
 * differ); rates and averages directly. Readings and comparisons aren't
 * compared (a reading only ever goes up; a comparison already is one).
 */
export function figureChanges(
  householdId: string,
  billId: string,
  db: Db = getDb(),
): Map<string, Change> {
  const out = new Map<string, Change>();
  const all = listBills(householdId, { everyone: true }, db);
  const current = all.find((b) => b.id === billId);
  if (!current) return out;
  const earlier = all
    .filter((b) => b.serviceId === current.serviceId && b.periodEnd < current.periodEnd)
    .sort((a, b) => toUtcMs(b.periodEnd) - toUtcMs(a.periodEnd));
  const figures = figuresFor(householdId, [current.id, ...earlier.map((b) => b.id)], db);
  const days = (b: BillListItem) => Math.max(1, daysInclusive(b.periodStart, b.periodEnd));
  for (const m of figures.get(current.id) ?? []) {
    if (m.kind === 'reading' || m.kind === 'comparison') continue;
    for (const b of earlier) {
      const before = (figures.get(b.id) ?? []).find(
        (x) => x.key === m.key && (x.unit ?? '') === (m.unit ?? ''),
      );
      if (!before) continue;
      const perDay = m.kind === 'usage' || m.kind === 'charge';
      const value = (x: BillMetric) => x.amountMinor ?? x.value;
      const was = value(before);
      const now = value(m);
      if (was !== null && now !== null)
        out.set(m.id, perDay ? change(was / days(b), now / days(current)) : change(was, now));
      break;
    }
  }
  return out;
}
