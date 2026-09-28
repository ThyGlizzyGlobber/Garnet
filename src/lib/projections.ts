import { and, asc, eq, gte, lte } from 'drizzle-orm';
import { getDb, type Db } from '@/db/client';
import { bill, projection, type Bill, type Cadence, type Member } from '@/db/schema';
import { addDays, daysInclusive, monthOf } from '@/lib/dates';
import { ulid } from '@/lib/ids';
import { listMembers } from '@/lib/members';
import { addMonths, allocateToMonths, monthBounds } from '@/lib/periods';
import { getCustomSplits, listServices, type ServiceWithType } from '@/lib/services';
import { computeShares } from '@/lib/splits';
import { normalMonthCostPerDay } from '@/lib/weather-model';
import { areaMonthCostPerDay } from '@/lib/regional';

export type ProjectionMethod = 'seasonal' | 'weather' | 'recent' | 'area' | 'single' | 'none';

export interface ServiceProjection {
  service: ServiceWithType;
  /** Estimated accrued cost for the target month, minor units. */
  monthMinor: number;
  method: ProjectionMethod;
  /** Cost per day used for the estimate. */
  perDay: number;
  /** Bills the estimate was derived from. */
  basisCount: number;
  /** Next expected bill after the latest one, when the cadence allows a guess. */
  nextBill: { periodStart: string; periodEnd: string; dueDate: string; amountMinor: number } | null;
}

export interface MonthProjection {
  month: string;
  totalMinor: number;
  services: ServiceProjection[];
  /** Per-member set-aside for the month, following each service's split. */
  setAside: { member: Member; minor: number }[];
  /** Equal-share convenience figure for the wall and headline. */
  setAsideEach: number | null;
  computedAt: string;
}

export const CADENCE_DAYS: Record<Cadence, number | null> = {
  weekly: 7,
  fortnightly: 14,
  monthly: 30,
  bimonthly: 61,
  quarterly: 91,
  annual: 365,
  irregular: null,
};

function perDay(b: Pick<Bill, 'amountMinor' | 'periodStart' | 'periodEnd'>): number {
  return b.amountMinor / Math.max(1, daysInclusive(b.periodStart, b.periodEnd));
}

function mean(xs: number[]): number {
  return xs.reduce((s, x) => s + x, 0) / xs.length;
}

/**
 * Daily cost estimate for one service in a target month.
 *  - seasonal: bills covering the same month a year earlier exist and there is
 *    enough recent history to measure drift → last year's daily cost × drift.
 *  - recent: mean daily cost of the last three bills.
 *  - single: only one bill so far.
 */
export function estimatePerDay(
  bills: Pick<Bill, 'amountMinor' | 'periodStart' | 'periodEnd'>[],
  targetMonth: string,
): { perDay: number; method: ProjectionMethod; basisCount: number } {
  const sorted = [...bills].sort((a, b) => a.periodStart.localeCompare(b.periodStart));
  if (sorted.length === 0) return { perDay: 0, method: 'none', basisCount: 0 };
  if (sorted.length === 1) return { perDay: perDay(sorted[0]!), method: 'single', basisCount: 1 };
  const recent = sorted.slice(-3);
  const recentPerDay = mean(recent.map(perDay));

  const lastYear = addMonths(targetMonth, -12);
  const ly = monthBounds(lastYear);
  const lastYearBills = sorted.filter((b) => b.periodStart <= ly.end && b.periodEnd >= ly.start);
  if (lastYearBills.length > 0 && sorted.length >= 4) {
    const seasonalPerDay = mean(lastYearBills.map(perDay));
    // Drift: how the last three bills compare with the three that preceded the same-month-last-year bills.
    const lyIndex = sorted.indexOf(lastYearBills[0]!);
    const before = sorted.slice(Math.max(0, lyIndex - 3), lyIndex);
    const drift = before.length ? recentPerDay / mean(before.map(perDay)) : 1;
    const bounded = Math.min(1.5, Math.max(0.67, drift));
    return {
      perDay: seasonalPerDay * bounded,
      method: 'seasonal',
      basisCount: lastYearBills.length + recent.length,
    };
  }
  return { perDay: recentPerDay, method: 'recent', basisCount: recent.length };
}

/** Same day `n` months later, clamped to the month's length. */
function addCalendarMonths(date: string, n: number): string {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  const target = new Date(Date.UTC(y, m - 1 + n, 1));
  const last = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
  ).getUTCDate();
  target.setUTCDate(Math.min(d, last));
  return target.toISOString().slice(0, 10);
}

/** Guess the next bill's period and due date from the latest bill and the cadence. */
export function nextBillGuess(
  latest: Pick<Bill, 'periodStart' | 'periodEnd' | 'dueDate'> | undefined,
  cadence: Cadence,
  perDayMinor: number,
): ServiceProjection['nextBill'] {
  if (!latest) return null;
  const periodStart = addDays(latest.periodEnd, 1);
  // Calendar-based cadences keep the calendar shape (a monthly bill spans a whole month,
  // whatever its length); the rest use the cadence's nominal length.
  const monthsFor: Partial<Record<Cadence, number>> = {
    monthly: 1,
    bimonthly: 2,
    quarterly: 3,
    annual: 12,
  };
  const months = monthsFor[cadence];
  const periodEnd = months
    ? addDays(addCalendarMonths(periodStart, months), -1)
    : addDays(
        periodStart,
        (CADENCE_DAYS[cadence] ?? daysInclusive(latest.periodStart, latest.periodEnd)) - 1,
      );
  const len = daysInclusive(periodStart, periodEnd);
  const dueOffset = Math.max(0, daysInclusive(latest.periodStart, latest.dueDate) - 1);
  const dueDate = addDays(periodStart, dueOffset);
  return { periodStart, periodEnd, dueDate, amountMinor: Math.round(perDayMinor * len) };
}

/** Project a month for every active service and cache the per-service rows. */
export function projectMonth(
  householdId: string,
  month: string,
  db: Db = getDb(),
): MonthProjection {
  const services = listServices(householdId, {}, db);
  const members = listMembers(householdId, db);
  const { start, end } = monthBounds(month);
  const days = daysInclusive(start, end);
  const now = new Date().toISOString();
  const rows: ServiceProjection[] = [];
  for (const svc of services) {
    const history = db
      .select()
      .from(bill)
      .where(and(eq(bill.householdId, householdId), eq(bill.serviceId, svc.id)))
      .orderBy(asc(bill.periodStart))
      .all();
    // A bill already covering part of the month counts as known cost, not an estimate.
    const known = history
      .flatMap((b) => allocateToMonths(b.amountMinor, b.periodStart, b.periodEnd))
      .filter((a) => a.month === month);
    const knownDays = known.reduce((s, a) => s + a.days, 0);
    const knownMinor = known.reduce((s, a) => s + a.minor, 0);
    let est = estimatePerDay(history, month);
    // No bill from this month last year: a seasonal service with a weather
    // model uses normal weather for the month instead of a flat recent average.
    if (svc.seasonal && (est.method === 'recent' || est.method === 'single')) {
      const perDay = normalMonthCostPerDay(householdId, svc.id, month, db);
      if (perDay !== null) est = { perDay, method: 'weather', basisCount: est.basisCount };
    }
    // Little or no history of its own: the typical cost for this kind of
    // service where the household lives (area figures, scope S4).
    if (est.method === 'none' || est.method === 'single') {
      const perDay = areaMonthCostPerDay(householdId, svc.typeSlug, month, start, db);
      if (perDay !== null) est = { perDay, method: 'area', basisCount: est.basisCount };
    }
    const remainingDays = Math.max(0, days - knownDays);
    const monthMinor = knownMinor + Math.round(est.perDay * remainingDays);
    const latest = history[history.length - 1];
    rows.push({
      service: svc,
      monthMinor,
      method: est.method,
      perDay: est.perDay,
      basisCount: est.basisCount,
      nextBill: nextBillGuess(latest, svc.cadence, est.perDay),
    });
    db.insert(projection)
      .values({
        id: ulid(),
        householdId,
        serviceId: svc.id,
        periodMonth: month,
        estimatedMinor: monthMinor,
        currency: latest?.currency ?? 'XXX',
        method: est.method,
        inputsJson: JSON.stringify({
          perDay: est.perDay,
          basisCount: est.basisCount,
          knownMinor,
          knownDays,
        }),
        computedAt: now,
      })
      .onConflictDoUpdate({
        target: [projection.serviceId, projection.periodMonth],
        set: {
          estimatedMinor: monthMinor,
          method: est.method,
          inputsJson: JSON.stringify({
            perDay: est.perDay,
            basisCount: est.basisCount,
            knownMinor,
            knownDays,
          }),
          computedAt: now,
        },
      })
      .run();
  }
  const totalMinor = rows.reduce((s, r) => s + r.monthMinor, 0);
  // Set-aside: split each service's estimate the way its bills would be split for this month.
  const byMember = new Map<string, number>();
  for (const r of rows) {
    if (r.monthMinor <= 0) continue;
    const shares = computeShares({
      amountMinor: r.monthMinor,
      periodStart: start,
      periodEnd: end,
      splitMode: r.service.splitMode,
      members,
      customWeights:
        r.service.splitMode === 'custom'
          ? getCustomSplits(householdId, r.service.id, db)
          : undefined,
      payerMemberId: r.service.payerMemberId,
    });
    for (const s of shares)
      byMember.set(s.memberId, (byMember.get(s.memberId) ?? 0) + s.amountMinor);
  }
  const setAside = members
    .filter((m) => byMember.has(m.id))
    .map((m) => ({ member: m, minor: byMember.get(m.id) ?? 0 }));
  const setAsideEach = setAside.length ? Math.round(mean(setAside.map((s) => s.minor))) : null;
  return { month, totalMinor, services: rows, setAside, setAsideEach, computedAt: now };
}

/** The month after the current one, which is what "set aside" is for. */
export function nextMonth(today: string): string {
  return addMonths(monthOf(today), 1);
}

/** Cached projections for a range of months (for the chart's estimate bars). */
export function cachedProjections(
  householdId: string,
  fromMonth: string,
  toMonth: string,
  db: Db = getDb(),
) {
  return db
    .select()
    .from(projection)
    .where(
      and(
        eq(projection.householdId, householdId),
        gte(projection.periodMonth, fromMonth),
        lte(projection.periodMonth, toMonth),
      ),
    )
    .all();
}
