import { and, eq, inArray, isNotNull } from 'drizzle-orm';
import { getDb, type Db } from '@/db/client';
import { bill, billMetric } from '@/db/schema';
import { usageHistory, type UsagePeriod } from '@/lib/consumption';
import { closestYearBefore } from '@/lib/averages';
import { getHousehold } from '@/lib/households';
import { householdCell, weatherNormals } from '@/lib/weather';

/**
 * How a service's bills follow the weather (scope S3):
 *
 *   per day ≈ base + heating × HDD/day + cooling × CDD/day
 *
 * fitted to its bills by least squares (weighted by days, so a quarterly bill
 * counts for three months). Used only when it genuinely explains the bills
 * (enough bills across seasons, R² ≥ 0.5), otherwise everything falls back to
 * the household's own history (S1).
 */

export interface WeatherFit {
  base: number;
  heating: number;
  cooling: number;
  /** Share of the bill-to-bill variation the weather explains (0–1). */
  r2: number;
  bills: number;
}

export interface WeatherPoint {
  days: number;
  hddPerDay: number;
  cddPerDay: number;
  /** The measure per day: usage, or cost in minor units. */
  value: number;
}

const MIN_BILLS = 6;
const MIN_R2 = 0.5;

/** Solve a small linear system (Gaussian elimination); null if singular. */
function solve(a: number[][], b: number[]): number[] | null {
  const n = b.length;
  const m = a.map((row, i) => [...row, b[i]!]);
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let r = col + 1; r < n; r++)
      if (Math.abs(m[r]![col]!) > Math.abs(m[pivot]![col]!)) pivot = r;
    if (Math.abs(m[pivot]![col]!) < 1e-9) return null;
    [m[col], m[pivot]] = [m[pivot]!, m[col]!];
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = m[r]![col]! / m[col]![col]!;
      for (let c = col; c <= n; c++) m[r]![c]! -= f * m[col]![c]!;
    }
  }
  return m.map((row, i) => row[n]! / row[i]!);
}

/** Weighted least squares over the chosen terms; coefficients in term order. */
function leastSquares(points: WeatherPoint[], terms: ((p: WeatherPoint) => number)[]) {
  const k = terms.length;
  const xtx = Array.from({ length: k }, () => new Array<number>(k).fill(0));
  const xty = new Array<number>(k).fill(0);
  for (const p of points) {
    const x = terms.map((t) => t(p));
    for (let i = 0; i < k; i++) {
      xty[i]! += p.days * x[i]! * p.value;
      for (let j = 0; j < k; j++) xtx[i]![j]! += p.days * x[i]! * x[j]!;
    }
  }
  return solve(xtx, xty);
}

function rSquared(points: WeatherPoint[], predict: (p: WeatherPoint) => number): number {
  const w = points.reduce((s, p) => s + p.days, 0);
  const mean = points.reduce((s, p) => s + p.days * p.value, 0) / w;
  let ssRes = 0;
  let ssTot = 0;
  for (const p of points) {
    ssRes += p.days * (p.value - predict(p)) ** 2;
    ssTot += p.days * (p.value - mean) ** 2;
  }
  return ssTot > 0 ? 1 - ssRes / ssTot : 0;
}

/**
 * The best fit whose weather terms are not negative (more cold never lowers a
 * heating bill): heating + cooling, heating only, or cooling only.
 */
export function fitWeather(points: WeatherPoint[]): WeatherFit | null {
  if (points.length < 3) return null;
  const one = () => 1;
  const hdd = (p: WeatherPoint) => p.hddPerDay;
  const cdd = (p: WeatherPoint) => p.cddPerDay;
  const candidates: WeatherFit[] = [];
  const tryFit = (terms: ('h' | 'c')[]) => {
    const coef = leastSquares(points, [one, ...terms.map((t) => (t === 'h' ? hdd : cdd))]);
    if (!coef) return;
    const fit = { base: coef[0]!, heating: 0, cooling: 0, r2: 0, bills: points.length };
    terms.forEach((t, i) => {
      if (t === 'h') fit.heating = coef[i + 1]!;
      else fit.cooling = coef[i + 1]!;
    });
    if (fit.heating < 0 || fit.cooling < 0 || fit.heating + fit.cooling === 0) return;
    fit.r2 = rSquared(points, (p) => expected(fit, p.hddPerDay, p.cddPerDay));
    candidates.push(fit);
  };
  tryFit(['h', 'c']);
  tryFit(['h']);
  tryFit(['c']);
  return candidates.sort((a, b) => b.r2 - a.r2)[0] ?? null;
}

export function expected(fit: WeatherFit, hddPerDay: number, cddPerDay: number): number {
  return fit.base + fit.heating * hddPerDay + fit.cooling * cddPerDay;
}

/** Good enough to show to people. */
function qualifies(fit: WeatherFit | null, points: WeatherPoint[]): fit is WeatherFit {
  if (!fit || fit.bills < MIN_BILLS || fit.r2 < MIN_R2) return false;
  const load = points.map((p) => p.hddPerDay + p.cddPerDay);
  // The bills must span different weather (at least two seasons).
  return Math.max(...load) - Math.min(...load) >= 1;
}

export interface ServiceWeather {
  unit: string | null;
  /** Periods with weather, oldest first, with their degree-days per day. */
  periods: (UsagePeriod & { hddPerDay: number; cddPerDay: number; solarPerDay: number })[];
  usage: WeatherFit | null;
  cost: WeatherFit | null;
  /** Solar export per day ≈ perRadiation × radiation (MJ/m²) per day. */
  solar: { perRadiation: number; r2: number } | null;
}

/** A service's weather models (each null unless it qualifies). */
export function serviceWeather(
  householdId: string,
  serviceId: string,
  db: Db = getDb(),
): ServiceWeather | null {
  const history = usageHistory(householdId, serviceId, db);
  if (!history) return null;
  const weather = new Map(
    db
      .select({ id: bill.id, hdd: bill.hdd, cdd: bill.cdd, solarMj: bill.solarMj })
      .from(bill)
      .where(
        and(
          eq(bill.householdId, householdId),
          eq(bill.serviceId, serviceId),
          isNotNull(bill.weatherFilledAt),
        ),
      )
      .all()
      .map((r) => [r.id, r]),
  );
  const periods = history.periods
    .filter((p) => weather.has(p.billId))
    .map((p) => {
      const w = weather.get(p.billId)!;
      return {
        ...p,
        hddPerDay: (w.hdd ?? 0) / p.days,
        cddPerDay: (w.cdd ?? 0) / p.days,
        solarPerDay: (w.solarMj ?? 0) / p.days,
      };
    });
  const usagePoints = periods
    .filter((p) => p.perDay !== null)
    .map((p) => ({
      days: p.days,
      hddPerDay: p.hddPerDay,
      cddPerDay: p.cddPerDay,
      value: p.perDay!,
    }));
  const costPoints = periods.map((p) => ({
    days: p.days,
    hddPerDay: p.hddPerDay,
    cddPerDay: p.cddPerDay,
    value: p.costPerDayMinor,
  }));
  const usage = fitWeather(usagePoints);
  const cost = fitWeather(costPoints);
  return {
    unit: history.unit,
    periods,
    usage: qualifies(usage, usagePoints) ? usage : null,
    cost: qualifies(cost, costPoints) ? cost : null,
    solar: solarFit(householdId, periods, db),
  };
}

/** Solar export against sunshine energy, through the origin (no sun, no export). */
function solarFit(
  householdId: string,
  periods: ServiceWeather['periods'],
  db: Db,
): ServiceWeather['solar'] {
  if (periods.length < MIN_BILLS) return null;
  const rows = db
    .select({ billId: billMetric.billId, value: billMetric.value })
    .from(billMetric)
    .where(
      and(
        eq(billMetric.householdId, householdId),
        eq(billMetric.key, 'solar_export'),
        inArray(
          billMetric.billId,
          periods.map((p) => p.billId),
        ),
      ),
    )
    .all();
  const exported = new Map<string, number>();
  for (const r of rows)
    if (r.value !== null) exported.set(r.billId, (exported.get(r.billId) ?? 0) + r.value);
  const points = periods
    .filter((p) => exported.has(p.billId) && p.solarPerDay > 0)
    .map((p) => ({ x: p.solarPerDay, y: exported.get(p.billId)! / p.days, w: p.days }));
  if (points.length < MIN_BILLS) return null;
  const k =
    points.reduce((s, p) => s + p.w * p.x * p.y, 0) /
    points.reduce((s, p) => s + p.w * p.x * p.x, 0);
  const w = points.reduce((s, p) => s + p.w, 0);
  const mean = points.reduce((s, p) => s + p.w * p.y, 0) / w;
  const ssRes = points.reduce((s, p) => s + p.w * (p.y - k * p.x) ** 2, 0);
  const ssTot = points.reduce((s, p) => s + p.w * (p.y - mean) ** 2, 0);
  const r2 = ssTot > 0 ? 1 - ssRes / ssTot : 0;
  return r2 >= MIN_R2 && k > 0 ? { perRadiation: k, r2 } : null;
}

/**
 * A seasonal service's cost per day in a calendar month of normal weather at
 * the household's postcode (minor units), or null without a qualifying model
 * or ten years of weather.
 */
export function normalMonthCostPerDay(
  householdId: string,
  serviceId: string,
  month: string,
  db: Db = getDb(),
): number | null {
  const hh = getHousehold(householdId, db);
  const cell = hh && householdCell(hh);
  if (!cell) return null;
  const normal = weatherNormals(cell.key, db).get(Number(month.slice(5, 7)));
  const fit = normal ? serviceWeather(householdId, serviceId, db)?.cost : null;
  if (!normal || !fit) return null;
  return Math.max(0, expected(fit, normal.hdd, normal.cdd));
}

export interface WeatherAdjusted {
  /** Compared with the bill from the same time last year, else the previous bill. */
  against: 'lastYear' | 'previous';
  measure: 'usage' | 'cost';
  /** Change per day as billed (0.12 = 12% more). */
  actual: number;
  /** How the weather differed: heating or cooling demand, per day. */
  weather: { kind: 'colder' | 'milder' | 'hotter' | 'cooler'; pct: number } | null;
  /** Change once the weather's effect is taken out. */
  adjusted: number;
  /** How much of the bills' variation the weather explains (0–1). */
  r2: number;
}

/**
 * The latest bill against the same time last year (else the previous bill),
 * with the weather's effect separated from the household's own: "you used 12%
 * more, but it was 18% colder; adjusted for the weather, 5% less".
 */
export function weatherAdjusted(
  householdId: string,
  serviceId: string,
  db: Db = getDb(),
): WeatherAdjusted | null {
  const sw = serviceWeather(householdId, serviceId, db);
  if (!sw) return null;
  const measure = sw.usage ? 'usage' : sw.cost ? 'cost' : null;
  if (!measure) return null;
  const fit = (measure === 'usage' ? sw.usage : sw.cost)!;
  const value = (p: ServiceWeather['periods'][number]) =>
    measure === 'usage' ? p.perDay : p.costPerDayMinor;
  const periods = sw.periods.filter((p) => value(p) !== null);
  const latest = periods.at(-1);
  if (!latest) return null;
  const lastYear = closestYearBefore(latest, periods.slice(0, -1));
  const other = lastYear ?? periods.at(-2);
  if (!other) return null;
  const expL = expected(fit, latest.hddPerDay, latest.cddPerDay);
  const expO = expected(fit, other.hddPerDay, other.cddPerDay);
  const vL = value(latest)!;
  const vO = value(other)!;
  if (expL <= 0 || expO <= 0 || vO <= 0) return null;
  const heatingLoad = fit.heating * (latest.hddPerDay + other.hddPerDay);
  const coolingLoad = fit.cooling * (latest.cddPerDay + other.cddPerDay);
  let weather: WeatherAdjusted['weather'] = null;
  if (heatingLoad >= coolingLoad && other.hddPerDay > 0) {
    const pct = latest.hddPerDay / other.hddPerDay - 1;
    weather = { kind: pct >= 0 ? 'colder' : 'milder', pct: Math.abs(pct) };
  } else if (coolingLoad > heatingLoad && other.cddPerDay > 0) {
    const pct = latest.cddPerDay / other.cddPerDay - 1;
    weather = { kind: pct >= 0 ? 'hotter' : 'cooler', pct: Math.abs(pct) };
  }
  return {
    against: lastYear ? 'lastYear' : 'previous',
    measure,
    actual: vL / vO - 1,
    weather,
    adjusted: vL / expL / (vO / expO) - 1,
    r2: fit.r2,
  };
}
