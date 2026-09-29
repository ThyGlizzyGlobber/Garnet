import { and, desc, eq, inArray, isNull } from 'drizzle-orm';
import { getDb, type Db } from '@/db/client';
import {
  bill,
  billMetric,
  household,
  householdConsent,
  regionalStat,
  service,
  type Household,
} from '@/db/schema';
import { daysInclusive } from '@/lib/dates';
import { getEnv } from '@/lib/env';
import { toMajor } from '@/lib/format';
import { getHousehold } from '@/lib/households';
import { ulid } from '@/lib/ids';
import { lookupPostcode } from '@/lib/location';
import { listActiveMembers } from '@/lib/members';
import { addMonths, allocateToMonths } from '@/lib/periods';
import { toCanonical } from '@/lib/units';

/**
 * Area comparisons (scope S4). Households that share (on by default, owner
 * decision; admins can turn it off) contribute anonymised monthly figures;
 * the worker pools them into medians and quartiles per area, service type,
 * month and household size. A figure is kept only when at least
 * REGIONAL_MIN_HOUSEHOLDS households stand behind it, and the pooled table
 * holds no household ids. Areas widen when a postcode is too thin: postcode →
 * region → state → country.
 */

/** Bump when the privacy notice about sharing changes; recorded with every choice. */
export const PRIVACY_NOTICE_VERSION = '2026-09-29';

type AreaLevel = 'postcode' | 'region' | 'state' | 'country';

type Metric = 'cost_per_day' | 'usage_per_day' | 'rate' | 'supply_per_day' | 'solar_per_day';

/** Months of history pooled. */
const POOL_MONTHS = 36;
/** A household's month counts only when its bills cover at least this many days of it. */
const MIN_DAYS_IN_MONTH = 15;

export function sizeBand(activeMembers: number): string {
  if (activeMembers <= 1) return '1';
  if (activeMembers === 2) return '2';
  if (activeMembers <= 4) return '3-4';
  return '5+';
}

/** The areas a household belongs to, finest first, with names for display. */
function householdAreas(hh: Household): { level: AreaLevel; area: string; name: string }[] {
  if (!hh.country || !hh.postalCode) return [];
  const pc = lookupPostcode(hh.country, hh.postalCode);
  const out: { level: AreaLevel; area: string; name: string }[] = [
    { level: 'postcode', area: `${hh.country}:${hh.postalCode}`, name: hh.postalCode },
  ];
  if (pc?.region)
    out.push({
      level: 'region',
      area: `${hh.country}:${pc.stateCode}:${pc.region}`,
      name: pc.region,
    });
  if (pc?.stateCode)
    out.push({ level: 'state', area: `${hh.country}:${pc.stateCode}`, name: pc.state });
  out.push({ level: 'country', area: hh.country, name: hh.country });
  return out;
}

export function regionalEnabled(): boolean {
  return getEnv().REGIONAL_INSIGHTS === 'on';
}

/** Turn a household's sharing on or off, and record who did it under which notice. */
export function setRegionalSharing(
  householdId: string,
  granted: boolean,
  how: 'default' | 'acknowledged' | 'settings',
  byMemberId: string | null,
  db: Db = getDb(),
): void {
  const now = new Date().toISOString();
  db.transaction((tx) => {
    tx.update(household)
      .set({ shareRegional: granted, updatedAt: now })
      .where(eq(household.id, householdId))
      .run();
    tx.insert(householdConsent)
      .values({
        id: ulid(),
        householdId,
        kind: 'regional',
        granted,
        how,
        noticeVersion: PRIVACY_NOTICE_VERSION,
        byMemberId,
        at: now,
      })
      .run();
  });
}

/** The household's latest recorded sharing choice, or null when it has never been shown the notice. */
export function latestRegionalChoice(householdId: string, db: Db = getDb()) {
  return (
    db
      .select()
      .from(householdConsent)
      .where(
        and(eq(householdConsent.householdId, householdId), eq(householdConsent.kind, 'regional')),
      )
      .orderBy(desc(householdConsent.at))
      .get() ?? null
  );
}

interface MonthValues {
  cost?: number;
  usage?: number;
  usageUnit?: string;
  supply?: number;
  solar?: number;
  days: number;
}

/**
 * One household's figures per service type and month: cost per day (minor
 * units), usage per day (canonical unit), supply charge per day, solar export
 * per day. Several services of one type (two meters) add up.
 */
function householdMonthly(
  householdId: string,
  db: Db = getDb(),
  sinceMonth?: string,
): Map<string, Map<string, MonthValues>> {
  const rows = db
    .select({ b: bill, typeSlug: service.typeSlug })
    .from(bill)
    .innerJoin(service, eq(bill.serviceId, service.id))
    // Household bills only: a member's personal bills aren't the household's.
    .where(and(eq(bill.householdId, householdId), isNull(bill.ownerMemberId)))
    .all();
  const metrics = rows.length
    ? db
        .select({
          billId: billMetric.billId,
          key: billMetric.key,
          value: billMetric.value,
          amountMinor: billMetric.amountMinor,
        })
        .from(billMetric)
        .where(
          and(
            eq(billMetric.householdId, householdId),
            inArray(billMetric.key, ['supply_charge', 'solar_export']),
          ),
        )
        .all()
    : [];
  const supply = new Map<string, number>();
  const solar = new Map<string, number>();
  for (const m of metrics) {
    if (m.key === 'supply_charge' && m.amountMinor !== null)
      supply.set(m.billId, (supply.get(m.billId) ?? 0) + m.amountMinor);
    if (m.key === 'solar_export' && m.value !== null)
      solar.set(m.billId, (solar.get(m.billId) ?? 0) + m.value);
  }
  // Per service first (per-day values), then summed per type.
  const perService = new Map<string, { type: string; months: Map<string, MonthValues> }>();
  for (const { b, typeSlug } of rows) {
    const total = daysInclusive(b.periodStart, b.periodEnd);
    const usage =
      b.usageQuantity !== null && b.usageUnit ? toCanonical(b.usageQuantity, b.usageUnit) : null;
    const entry = perService.get(b.serviceId) ?? { type: typeSlug, months: new Map() };
    for (const a of allocateToMonths(b.amountMinor, b.periodStart, b.periodEnd)) {
      if (sinceMonth && a.month < sinceMonth) continue;
      const v = entry.months.get(a.month) ?? { days: 0 };
      v.days += a.days;
      v.cost = (v.cost ?? 0) + a.minor;
      if (usage) {
        v.usage = (v.usage ?? 0) + (usage.quantity * a.days) / total;
        v.usageUnit = usage.unit;
      }
      if (supply.has(b.id)) v.supply = (v.supply ?? 0) + (supply.get(b.id)! * a.days) / total;
      if (solar.has(b.id)) v.solar = (v.solar ?? 0) + (solar.get(b.id)! * a.days) / total;
      entry.months.set(a.month, v);
    }
    perService.set(b.serviceId, entry);
  }
  const out = new Map<string, Map<string, MonthValues>>();
  for (const { type, months } of perService.values()) {
    const byMonth = out.get(type) ?? new Map<string, MonthValues>();
    for (const [month, v] of months) {
      if (v.days < MIN_DAYS_IN_MONTH) continue;
      const perDay = (x: number | undefined) => (x === undefined ? undefined : x / v.days);
      const acc = byMonth.get(month) ?? { days: v.days };
      const add = (a: number | undefined, b: number | undefined) =>
        a === undefined ? b : b === undefined ? a : a + b;
      acc.cost = add(acc.cost, perDay(v.cost));
      acc.usage = add(acc.usage, perDay(v.usage));
      acc.usageUnit ??= v.usageUnit;
      acc.supply = add(acc.supply, perDay(v.supply));
      acc.solar = add(acc.solar, perDay(v.solar));
      byMonth.set(month, acc);
    }
    out.set(type, byMonth);
  }
  return out;
}

/** The figures a month contributes, with their units. */
function metricsOf(
  v: MonthValues,
  currency: string,
): { metric: Metric; unit: string; value: number }[] {
  const out: { metric: Metric; unit: string; value: number }[] = [];
  if (v.cost !== undefined) out.push({ metric: 'cost_per_day', unit: currency, value: v.cost });
  if (v.usage !== undefined && v.usageUnit) {
    out.push({ metric: 'usage_per_day', unit: v.usageUnit, value: v.usage });
    if (v.cost !== undefined && v.usage > 0)
      out.push({
        metric: 'rate',
        unit: `${currency}/${v.usageUnit}`,
        // Rates are major units per unit of usage (0.2953 AUD/kWh), like bill figures.
        value: toMajor(v.cost, currency) / v.usage,
      });
  }
  if (v.supply !== undefined)
    out.push({ metric: 'supply_per_day', unit: currency, value: v.supply });
  if (v.solar !== undefined) out.push({ metric: 'solar_per_day', unit: 'kWh', value: v.solar });
  return out;
}

function quantile(sorted: number[], q: number): number {
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (pos - lo);
}

/**
 * Recompute every area figure from the households that share. Runs from the
 * worker (every six hours, and when a household stops sharing).
 */
export function computeRegionalStats(
  db: Db = getDb(),
  now = new Date(),
): { households: number; rows: number } {
  const k = getEnv().REGIONAL_MIN_HOUSEHOLDS;
  const today = now.toISOString().slice(0, 10);
  const since = addMonths(today.slice(0, 7), -POOL_MONTHS);
  const homes = db
    .select()
    .from(household)
    .where(eq(household.shareRegional, true))
    .all()
    .filter((h) => !h.isDemo && h.country && h.postalCode);
  // key → one value per household
  const pools = new Map<string, { unit: string; values: Map<string, number> }>();
  for (const hh of homes) {
    const band = sizeBand(listActiveMembers(hh.id, today, db).length);
    const areas = householdAreas(hh);
    for (const [type, months] of householdMonthly(hh.id, db, since))
      for (const [month, v] of months)
        for (const m of metricsOf(v, hh.currency))
          for (const a of areas)
            for (const b of [band, 'all']) {
              const key = [a.level, a.area, type, month, b, m.metric].join('|');
              const pool = pools.get(key) ?? { unit: m.unit, values: new Map() };
              if (pool.unit !== m.unit) continue; // never mix currencies or units
              pool.values.set(hh.id, m.value);
              pools.set(key, pool);
            }
  }
  const computedAt = now.toISOString();
  const rows = [...pools.entries()]
    .filter(([, p]) => p.values.size >= k)
    .map(([key, p]) => {
      const [level, area, serviceType, month, sizeBand, metric] = key.split('|') as [
        AreaLevel,
        string,
        string,
        string,
        string,
        string,
      ];
      const sorted = [...p.values.values()].sort((a, b) => a - b);
      return {
        level,
        area,
        serviceType,
        month,
        sizeBand,
        metric,
        unit: p.unit,
        households: sorted.length,
        median: quantile(sorted, 0.5),
        p25: quantile(sorted, 0.25),
        p75: quantile(sorted, 0.75),
        computedAt,
      };
    });
  db.transaction((tx) => {
    tx.delete(regionalStat).run();
    for (let i = 0; i < rows.length; i += 200)
      tx.insert(regionalStat)
        .values(rows.slice(i, i + 200))
        .run();
  });
  return { households: homes.length, rows: rows.length };
}

interface AreaFigure {
  median: number;
  p25: number;
  p75: number;
  households: number;
  unit: string;
  /** This household's own figure for the same month, when it has one. */
  you: number | null;
}

export interface AreaComparison {
  month: string;
  level: AreaLevel;
  areaName: string;
  /** Compared with households of the same size, or with all households there. */
  sameSize: boolean;
  cost: AreaFigure | null;
  usage: AreaFigure | null;
  rate: AreaFigure | null;
}

/** The finest area (and same household size, if possible) with a figure for this type, month and metric. */
function findStat(
  hh: Household,
  type: string,
  month: string,
  metric: Metric,
  band: string,
  db: Db,
) {
  for (const a of householdAreas(hh))
    for (const b of [band, 'all']) {
      const row = db
        .select()
        .from(regionalStat)
        .where(
          and(
            eq(regionalStat.level, a.level),
            eq(regionalStat.area, a.area),
            eq(regionalStat.serviceType, type),
            eq(regionalStat.month, month),
            eq(regionalStat.sizeBand, b),
            eq(regionalStat.metric, metric),
          ),
        )
        .get();
      if (row) return { row, area: a, sameSize: b !== 'all' };
    }
  return null;
}

/**
 * "Households like yours in 3550 used a median 11.2 kWh a day in July; you
 * used 12.8." For the service's most recent month with an area figure.
 * Only for households that share (you see the area only if you're part of it).
 */
export function areaComparison(
  householdId: string,
  serviceId: string,
  today: string,
  db: Db = getDb(),
): AreaComparison | null {
  if (!regionalEnabled()) return null;
  const hh = getHousehold(householdId, db);
  if (!hh?.shareRegional) return null;
  const svc = db
    .select()
    .from(service)
    .where(and(eq(service.householdId, householdId), eq(service.id, serviceId)))
    .get();
  if (!svc) return null;
  const band = sizeBand(listActiveMembers(householdId, today, db).length);
  const mine = householdMonthly(householdId, db).get(svc.typeSlug);
  if (!mine) return null;
  const months = [...mine.keys()].sort().reverse();
  for (const month of months) {
    const cost = findStat(hh, svc.typeSlug, month, 'cost_per_day', band, db);
    if (!cost) continue;
    const v = mine.get(month)!;
    const own = new Map(metricsOf(v, hh.currency).map((m) => [m.metric, m.value]));
    const figure = (metric: Metric): AreaFigure | null => {
      const s =
        metric === 'cost_per_day' ? cost : findStat(hh, svc.typeSlug, month, metric, band, db);
      if (!s) return null;
      return {
        median: s.row.median,
        p25: s.row.p25,
        p75: s.row.p75,
        households: s.row.households,
        unit: s.row.unit,
        you: own.get(metric) ?? null,
      };
    };
    return {
      month,
      level: cost.area.level,
      areaName: cost.area.name,
      sameSize: cost.sameSize,
      cost: figure('cost_per_day'),
      usage: figure('usage_per_day'),
      rate: figure('rate'),
    };
  }
  return null;
}

/**
 * Filling a gap: the typical cost per day for a service type in a calendar
 * month where the household lives, from the latest year that has a figure.
 * For households that share; null otherwise or when the area has no figure.
 */
export function areaMonthCostPerDay(
  householdId: string,
  serviceType: string,
  month: string,
  today: string,
  db: Db = getDb(),
): number | null {
  if (!regionalEnabled()) return null;
  const hh = getHousehold(householdId, db);
  if (!hh?.shareRegional) return null;
  const band = sizeBand(listActiveMembers(householdId, today, db).length);
  for (let back = 0; back <= 36; back += 12) {
    const m = addMonths(month, -back);
    if (m > today.slice(0, 7)) continue;
    const s = findStat(hh, serviceType, m, 'cost_per_day', band, db);
    if (s) return s.row.median;
  }
  return null;
}

/** Counts for the Status page. */
export function regionalCounts(db: Db = getDb()) {
  const sharing = db
    .select()
    .from(household)
    .where(eq(household.shareRegional, true))
    .all()
    .filter((h) => !h.isDemo && h.postalCode).length;
  const figures = db.select({ level: regionalStat.level }).from(regionalStat).all().length;
  return { sharing, figures };
}
