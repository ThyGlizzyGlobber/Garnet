import { and, eq, inArray } from 'drizzle-orm';
import { getDb, type Db } from '@/db/client';
import { billMetric } from '@/db/schema';
import { listBills, type BillListItem } from '@/lib/bills';
import { DAYS_PER_MONTH } from '@/lib/consumption';
import { addDays, daysInclusive, overlapDays } from '@/lib/dates';
import { getHousehold } from '@/lib/households';
import { addMonths, monthBounds } from '@/lib/periods';
import { projectMonth } from '@/lib/projections';
import { listServices } from '@/lib/services';
import { householdCell, weatherNormals, type MonthNormal } from '@/lib/weather';
import { expected, serviceWeather } from '@/lib/weather-model';

/**
 * Seasons (scope S1): which season is coming for a household, and what the
 * same change did to each seasonal service's bills last year.
 *
 * Until households have a postcode (S2), hemisphere and climate come from the
 * household's timezone. Calculations use months and bills, never season names;
 * the names are only for wording.
 */

export type Hemisphere = 'south' | 'north';
export type Climate = 'temperate' | 'tropical';
export type Season = 'summer' | 'autumn' | 'winter' | 'spring' | 'wet' | 'dry';

const SOUTHERN_ZONES = [
  /^Australia\//,
  /^Antarctica\//,
  /^Pacific\/(Auckland|Chatham|Fiji|Tongatapu|Noumea|Efate|Apia|Port_Moresby)$/,
  /^America\/(Argentina\/.+|Santiago|Sao_Paulo|Montevideo|Asuncion|Punta_Arenas|La_Paz|Lima)$/,
  /^Africa\/(Johannesburg|Maputo|Harare|Windhoek|Gaborone|Maseru|Mbabane|Lusaka|Blantyre)$/,
  /^Indian\/(Mauritius|Reunion|Antananarivo)$/,
  /^Atlantic\/Stanley$/,
];
/** Places where wet and dry seasons matter more than winter and summer. */
const TROPICAL_ZONES = [/^Australia\/Darwin$/];

/**
 * Hemisphere and climate for a household: from its postcode's map point when
 * it has one (the tropics = within 23.44° of the equator, where wet and dry
 * seasons matter more than winter and summer), else from its timezone.
 */
export function householdClimate(hh: { timezone: string; latitude: number | null }): {
  hemisphere: Hemisphere;
  climate: Climate;
  from: 'postcode' | 'timezone';
} {
  if (hh.latitude !== null)
    return {
      hemisphere: hh.latitude < 0 ? 'south' : 'north',
      climate: Math.abs(hh.latitude) < 23.44 ? 'tropical' : 'temperate',
      from: 'postcode',
    };
  return {
    hemisphere: hemisphereOf(hh.timezone),
    climate: climateOf(hh.timezone),
    from: 'timezone',
  };
}

export function hemisphereOf(timezone: string): Hemisphere {
  return SOUTHERN_ZONES.some((re) => re.test(timezone)) ? 'south' : 'north';
}

export function climateOf(timezone: string): Climate {
  return TROPICAL_ZONES.some((re) => re.test(timezone)) ? 'tropical' : 'temperate';
}

/** The season a calendar month (1–12) falls in. */
export function seasonOf(month: number, hemisphere: Hemisphere, climate: Climate): Season {
  if (climate === 'tropical') {
    const wetSouth = month >= 11 || month <= 4; // Nov–Apr
    return (hemisphere === 'south') === wetSouth ? 'wet' : 'dry';
  }
  // Meteorological seasons; the southern hemisphere is six months on.
  const m = hemisphere === 'south' ? ((month + 5) % 12) + 1 : month;
  if (m === 12 || m <= 2) return 'winter';
  if (m <= 5) return 'spring';
  if (m <= 8) return 'summer';
  return 'autumn';
}

const monthNumber = (ym: string) => Number(ym.slice(5, 7));

export interface SeasonChange {
  season: Season;
  /** First month of the coming season (YYYY-MM). */
  startMonth: string;
  daysUntil: number;
  /** The season it follows, and when that started (YYYY-MM). */
  previous: Season;
  previousStart: string;
}

/** The next change of season after `today` (YYYY-MM-DD). */
export function nextSeason(today: string, hemisphere: Hemisphere, climate: Climate): SeasonChange {
  const thisMonth = today.slice(0, 7);
  const current = seasonOf(monthNumber(thisMonth), hemisphere, climate);
  let startMonth = addMonths(thisMonth, 1);
  while (seasonOf(monthNumber(startMonth), hemisphere, climate) === current)
    startMonth = addMonths(startMonth, 1);
  let previousStart = thisMonth;
  while (seasonOf(monthNumber(addMonths(previousStart, -1)), hemisphere, climate) === current)
    previousStart = addMonths(previousStart, -1);
  return {
    season: seasonOf(monthNumber(startMonth), hemisphere, climate),
    startMonth,
    daysUntil: daysInclusive(today, `${startMonth}-01`) - 1,
    previous: current,
    previousStart,
  };
}

/** Months in a season occurrence starting at startMonth. */
function seasonEnd(startMonth: string, hemisphere: Hemisphere, climate: Climate): string {
  const season = seasonOf(monthNumber(startMonth), hemisphere, climate);
  let m = startMonth;
  while (seasonOf(monthNumber(addMonths(m, 1)), hemisphere, climate) === season)
    m = addMonths(m, 1);
  return m;
}

/**
 * A value per day over a date window, from the bills overlapping it (each
 * bill's value spread evenly over its own period), and how much of the window
 * the bills cover (0–1).
 */
function windowPerDay(
  bills: Pick<BillListItem, 'id' | 'periodStart' | 'periodEnd'>[],
  start: string,
  end: string,
  value: (b: { id: string }) => number | null,
): { perDay: number; coverage: number } {
  let sum = 0;
  let covered = 0;
  for (const b of bills) {
    const v = value(b);
    if (v === null) continue;
    const overlap = overlapDays(b.periodStart, b.periodEnd, start, end);
    if (!overlap) continue;
    sum += (v * overlap) / daysInclusive(b.periodStart, b.periodEnd);
    covered += overlap;
  }
  const days = daysInclusive(start, end);
  return { perDay: covered ? sum / covered : 0, coverage: Math.min(1, covered / days) };
}

export interface SeasonNotice {
  serviceId: string;
  serviceName: string;
  season: Season;
  previous: Season;
  startMonth: string;
  daysUntil: number;
  /** Last year: cost per day in the coming season over the season before (1.35 = 35% more). */
  costRatio: number;
  /** The same for usage, when the bills show usage. */
  usageRatio: number | null;
  /** The same for solar export, when the bills show it. */
  solarRatio: number | null;
  /** What the change means per month at today's prices and usage (minor units, ±). */
  monthlyImpactMinor: number;
  currency: string;
  /** Last year's bills, or normal weather + how the bills follow it (S3). */
  basis: 'last_year' | 'weather';
  /** Year the comparison comes from (last_year basis). */
  basisYear: string;
  /** The projection for the season's first month already uses last year's same month. */
  setAsideCovers: boolean;
}

/** Days before a season change that the notice appears. */
const NOTICE_DAYS = 28;
/** Last year's bills must cover this share of both seasons. */
const MIN_COVERAGE = 0.6;
/** Changes smaller than this aren't worth a notice. */
const MIN_CHANGE = 0.1;

/**
 * For each seasonal service with last year's bills for both seasons: what the
 * coming change of season did to its cost (and usage, and solar export) last
 * year, and what that means per month now. Empty outside the notice window.
 */
export function seasonAhead(
  householdId: string,
  today: string,
  db: Db = getDb(),
  opts: { windowDays?: number } = {},
): SeasonNotice[] {
  const hh = getHousehold(householdId, db);
  if (!hh) return [];
  const { hemisphere, climate } = householdClimate(hh);
  const change = nextSeason(today, hemisphere, climate);
  if (change.daysUntil > (opts.windowDays ?? NOTICE_DAYS)) return [];

  // Last year's occurrence of the season before, and of the coming season.
  const prevStart = monthBounds(addMonths(change.previousStart, -12)).start;
  const nextStart = monthBounds(addMonths(change.startMonth, -12)).start;
  const nextEnd = monthBounds(
    addMonths(seasonEnd(change.startMonth, hemisphere, climate), -12),
  ).end;
  const prevEnd = addDays(nextStart, -1);

  const services = listServices(householdId, {}, db).filter((s) => s.seasonal);
  if (!services.length) return [];
  const projection = projectMonth(householdId, change.startMonth, db);
  const notices: SeasonNotice[] = [];
  for (const svc of services) {
    const bills = listBills(householdId, { serviceId: svc.id }, db);
    if (!bills.length) continue;
    const byId = new Map(bills.map((b) => [b.id, b]));
    const cost = (b: { id: string }) => byId.get(b.id)!.amountMinor;
    const before = windowPerDay(bills, prevStart, prevEnd, cost);
    const during = windowPerDay(bills, nextStart, nextEnd, cost);
    const cadence = projection.services.find((p) => p.service.id === svc.id)?.method;
    if (before.coverage < MIN_COVERAGE || during.coverage < MIN_COVERAGE || !before.perDay) {
      // No bills from last year's change of season: use normal weather, if the
      // bills follow it well enough (scope S3).
      const w = seasonFromWeather(householdId, svc.id, change, hemisphere, climate, db);
      if (!w) continue;
      const bigCost = Math.abs(w.costRatio - 1) >= MIN_CHANGE;
      const bigSolar = w.solarRatio !== null && Math.abs(w.solarRatio - 1) >= 0.25;
      if (!bigCost && !bigSolar) continue;
      const recent = windowPerDay(bills, addDays(today, -120), today, cost);
      const base = recent.coverage >= 0.5 ? recent.perDay : w.previousPerDay;
      notices.push({
        serviceId: svc.id,
        serviceName: svc.name,
        season: change.season,
        previous: change.previous,
        startMonth: change.startMonth,
        daysUntil: change.daysUntil,
        costRatio: w.costRatio,
        usageRatio: w.usageRatio,
        solarRatio: w.solarRatio,
        monthlyImpactMinor: Math.round(base * (w.costRatio - 1) * DAYS_PER_MONTH),
        currency: bills[0]!.currency,
        basis: 'weather',
        basisYear: '',
        setAsideCovers: cadence === 'seasonal' || cadence === 'weather',
      });
      continue;
    }
    const costRatio = during.perDay / before.perDay;

    const usage = (b: { id: string }) => byId.get(b.id)!.usageQuantity;
    const usageBefore = windowPerDay(bills, prevStart, prevEnd, usage);
    const usageDuring = windowPerDay(bills, nextStart, nextEnd, usage);
    const usageRatio =
      usageBefore.coverage >= MIN_COVERAGE &&
      usageDuring.coverage >= MIN_COVERAGE &&
      usageBefore.perDay > 0
        ? usageDuring.perDay / usageBefore.perDay
        : null;

    const solar = solarByBill(
      householdId,
      bills.map((b) => b.id),
      db,
    );
    const solarValue = (b: { id: string }) => solar.get(b.id) ?? null;
    const solarBefore = windowPerDay(bills, prevStart, prevEnd, solarValue);
    const solarDuring = windowPerDay(bills, nextStart, nextEnd, solarValue);
    const solarRatio =
      solarBefore.coverage >= MIN_COVERAGE &&
      solarDuring.coverage >= MIN_COVERAGE &&
      solarBefore.perDay > 0
        ? solarDuring.perDay / solarBefore.perDay
        : null;

    const bigCost = Math.abs(costRatio - 1) >= MIN_CHANGE;
    const bigSolar = solarRatio !== null && Math.abs(solarRatio - 1) >= 0.25;
    if (!bigCost && !bigSolar) continue;

    // Today's level: the last four months of bills, else last year's season before.
    const recent = windowPerDay(bills, addDays(today, -120), today, cost);
    const base = recent.coverage >= 0.5 ? recent.perDay : before.perDay;
    notices.push({
      serviceId: svc.id,
      serviceName: svc.name,
      season: change.season,
      previous: change.previous,
      startMonth: change.startMonth,
      daysUntil: change.daysUntil,
      costRatio,
      usageRatio,
      solarRatio,
      monthlyImpactMinor: Math.round(base * (costRatio - 1) * DAYS_PER_MONTH),
      currency: bills[0]!.currency,
      basis: 'last_year',
      basisYear: nextStart.slice(0, 4),
      setAsideCovers: cadence === 'seasonal',
    });
  }
  return notices;
}

/**
 * The coming change of season from normal weather at the household's postcode
 * and the service's weather models: cost (and usage, and solar export) per day
 * over the coming season's months against the current season's.
 */
function seasonFromWeather(
  householdId: string,
  serviceId: string,
  change: SeasonChange,
  hemisphere: Hemisphere,
  climate: Climate,
  db: Db,
): {
  costRatio: number;
  usageRatio: number | null;
  solarRatio: number | null;
  previousPerDay: number;
} | null {
  const hh = getHousehold(householdId, db);
  const cell = hh && householdCell(hh);
  if (!cell) return null;
  const normals = weatherNormals(cell.key, db);
  const sw = serviceWeather(householdId, serviceId, db);
  if (!sw?.cost) return null;
  const months = (from: string, to: string) => {
    const out: number[] = [];
    for (let m = from; m <= to; m = addMonths(m, 1)) out.push(monthNumber(m));
    return out;
  };
  const avg = (ms: number[]) => {
    const ns = ms.map((m) => normals.get(m));
    if (ns.some((n) => !n)) return null;
    const mean = (f: (n: MonthNormal) => number) => ns.reduce((s, n) => s + f(n!), 0) / ns.length;
    return {
      hdd: mean((n) => n.hdd),
      cdd: mean((n) => n.cdd),
      radiation: mean((n) => n.radiation),
    };
  };
  const previous = avg(months(change.previousStart, addMonths(change.startMonth, -1)));
  const coming = avg(months(change.startMonth, seasonEnd(change.startMonth, hemisphere, climate)));
  if (!previous || !coming) return null;
  const costBefore = expected(sw.cost, previous.hdd, previous.cdd);
  const costAfter = expected(sw.cost, coming.hdd, coming.cdd);
  if (costBefore <= 0) return null;
  const usageBefore = sw.usage ? expected(sw.usage, previous.hdd, previous.cdd) : 0;
  return {
    costRatio: costAfter / costBefore,
    usageRatio:
      sw.usage && usageBefore > 0 ? expected(sw.usage, coming.hdd, coming.cdd) / usageBefore : null,
    solarRatio: sw.solar && previous.radiation > 0 ? coming.radiation / previous.radiation : null,
    previousPerDay: costBefore,
  };
}

/** Solar export figure per bill (from the bill's figures), when there is one. */
function solarByBill(householdId: string, billIds: string[], db: Db): Map<string, number> {
  const out = new Map<string, number>();
  if (!billIds.length) return out;
  const rows = db
    .select({ billId: billMetric.billId, value: billMetric.value })
    .from(billMetric)
    .where(
      and(
        eq(billMetric.householdId, householdId),
        eq(billMetric.key, 'solar_export'),
        inArray(billMetric.billId, billIds),
      ),
    )
    .all();
  for (const r of rows) if (r.value !== null) out.set(r.billId, (out.get(r.billId) ?? 0) + r.value);
  return out;
}
