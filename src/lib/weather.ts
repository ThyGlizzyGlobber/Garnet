import { and, asc, eq, gte, isNotNull, isNull, lte, max, min } from 'drizzle-orm';
import { getDb, type Db } from '@/db/client';
import { bill, household, weatherDay, weatherForecast, type WeatherDay } from '@/db/schema';
import { addDays, daysInclusive } from '@/lib/dates';
import { getEnv } from '@/lib/env';
import type { DailyWeather, WeatherProvider } from '@/weather';

/**
 * Weather for households with a postcode (scope S3). Days are cached per map
 * square (0.1°, ~10 km) and shared by every household in it; pages only ever
 * read the cache. The worker fills it (syncWeather) and sums each bill's
 * period into heating/cooling degree-days and solar energy (fillBillWeather).
 */

export interface Cell {
  key: string;
  lat: number;
  lon: number;
}

/** The map square a point falls in, e.g. "-36.7,144.3". */
export function cellOf(lat: number, lon: number): Cell {
  const la = Math.round(lat * 10) / 10;
  const lo = Math.round(lon * 10) / 10;
  return { key: `${la.toFixed(1)},${lo.toFixed(1)}`, lat: la, lon: lo };
}

export function householdCell(hh: { latitude: number | null; longitude: number | null }) {
  return hh.latitude === null || hh.longitude === null ? null : cellOf(hh.latitude, hh.longitude);
}

/** Heating degree-days for one day: how far its mean temperature fell below the base. */
export function heatingDegrees(tempMean: number, base = getEnv().WEATHER_HDD_BASE): number {
  return Math.max(0, base - tempMean);
}

/** Cooling degree-days for one day: how far its mean temperature rose above the base. */
export function coolingDegrees(tempMean: number, base = getEnv().WEATHER_CDD_BASE): number {
  return Math.max(0, tempMean - base);
}

/** Final history (archive) overrides provisional recent days; never the other way round. */
export function storeDays(
  cell: string,
  days: DailyWeather[],
  source: 'archive' | 'recent',
  db: Db = getDb(),
): number {
  const now = new Date().toISOString();
  let stored = 0;
  for (const d of days) {
    if (d.tempMean === null) continue;
    const row = {
      cell,
      date: d.date,
      tempMean: d.tempMean,
      tempMin: d.tempMin,
      tempMax: d.tempMax,
      radiation: d.radiation,
      sunshine: d.sunshine,
      code: d.code,
      source,
      fetchedAt: now,
    };
    const q = db.insert(weatherDay).values(row);
    if (source === 'archive')
      q.onConflictDoUpdate({ target: [weatherDay.cell, weatherDay.date], set: row }).run();
    else
      q.onConflictDoUpdate({
        target: [weatherDay.cell, weatherDay.date],
        set: row,
        setWhere: eq(weatherDay.source, 'recent'),
      }).run();
    stored++;
  }
  return stored;
}

export function replaceForecast(cell: string, days: DailyWeather[], db: Db = getDb()): void {
  const now = new Date().toISOString();
  db.transaction((tx) => {
    tx.delete(weatherForecast).where(eq(weatherForecast.cell, cell)).run();
    for (const d of days)
      tx.insert(weatherForecast)
        .values({
          cell,
          date: d.date,
          tempMean: d.tempMean,
          tempMin: d.tempMin,
          tempMax: d.tempMax,
          radiation: d.radiation,
          sunshine: d.sunshine,
          code: d.code,
          rainChance: d.rainChance ?? null,
          fetchedAt: now,
        })
        .run();
  });
}

export function weatherDays(
  cell: string,
  from: string,
  to: string,
  db: Db = getDb(),
): WeatherDay[] {
  return db
    .select()
    .from(weatherDay)
    .where(and(eq(weatherDay.cell, cell), gte(weatherDay.date, from), lte(weatherDay.date, to)))
    .orderBy(asc(weatherDay.date))
    .all();
}

export function forecastFor(cell: string, from: string, db: Db = getDb()) {
  return db
    .select()
    .from(weatherForecast)
    .where(and(eq(weatherForecast.cell, cell), gte(weatherForecast.date, from)))
    .orderBy(asc(weatherForecast.date))
    .all();
}

/** Degree-days and solar energy summed over a period, when every day has weather. */
export function periodWeather(
  cell: string,
  from: string,
  to: string,
  db: Db = getDb(),
): { hdd: number; cdd: number; solarMj: number; days: number } | null {
  const days = weatherDays(cell, from, to, db);
  if (days.length < daysInclusive(from, to)) return null;
  let hdd = 0;
  let cdd = 0;
  let solarMj = 0;
  for (const d of days) {
    hdd += heatingDegrees(d.tempMean!);
    cdd += coolingDegrees(d.tempMean!);
    solarMj += d.radiation ?? 0;
  }
  return { hdd, cdd, solarMj, days: days.length };
}

export interface MonthNormal {
  /** Per day, averaged over the years on record for that calendar month. */
  hdd: number;
  cdd: number;
  radiation: number;
  tempMean: number;
  years: number;
}

/** Years of history kept for "normal" weather. */
export const NORMAL_YEARS = 10;

/**
 * Normal weather per calendar month (1–12) for a map square, from the stored
 * history. A month counts once at least five years of it are on record.
 */
export function weatherNormals(cell: string, db: Db = getDb()): Map<number, MonthNormal> {
  const rows = db
    .select({
      date: weatherDay.date,
      tempMean: weatherDay.tempMean,
      radiation: weatherDay.radiation,
    })
    .from(weatherDay)
    .where(eq(weatherDay.cell, cell))
    .all();
  const acc = new Map<
    number,
    { hdd: number; cdd: number; rad: number; t: number; n: number; years: Set<string> }
  >();
  for (const r of rows) {
    if (r.tempMean === null) continue;
    const m = Number(r.date.slice(5, 7));
    const a = acc.get(m) ?? { hdd: 0, cdd: 0, rad: 0, t: 0, n: 0, years: new Set<string>() };
    a.hdd += heatingDegrees(r.tempMean);
    a.cdd += coolingDegrees(r.tempMean);
    a.rad += r.radiation ?? 0;
    a.t += r.tempMean;
    a.n++;
    a.years.add(r.date.slice(0, 4));
    acc.set(m, a);
  }
  const out = new Map<number, MonthNormal>();
  for (const [m, a] of acc)
    if (a.years.size >= 5)
      out.set(m, {
        hdd: a.hdd / a.n,
        cdd: a.cdd / a.n,
        radiation: a.rad / a.n,
        tempMean: a.t / a.n,
        years: a.years.size,
      });
  return out;
}

/** Fill degree-days on a household's bills whose whole period now has weather. */
export function fillBillWeather(householdId: string, db: Db = getDb()): number {
  const hh = db.select().from(household).where(eq(household.id, householdId)).get();
  const cell = hh && householdCell(hh);
  if (!cell) return 0;
  const bills = db
    .select({ id: bill.id, periodStart: bill.periodStart, periodEnd: bill.periodEnd })
    .from(bill)
    .where(and(eq(bill.householdId, householdId), isNull(bill.weatherFilledAt)))
    .all();
  let filled = 0;
  const now = new Date().toISOString();
  for (const b of bills) {
    const w = periodWeather(cell.key, b.periodStart, b.periodEnd, db);
    if (!w) continue;
    db.update(bill)
      .set({ hdd: w.hdd, cdd: w.cdd, solarMj: w.solarMj, weatherFilledAt: now })
      .where(eq(bill.id, b.id))
      .run();
    filled++;
  }
  return filled;
}

/** The household moved (or removed its postcode): its bills' weather is refilled. */
export function resetBillWeather(householdId: string, db: Db = getDb()): void {
  db.update(bill)
    .set({ hdd: null, cdd: null, solarMj: null, weatherFilledAt: null })
    .where(eq(bill.householdId, householdId))
    .run();
}

/**
 * What the last sync did, for the Status page. Kept on globalThis: the worker
 * (started from instrumentation) and the pages are bundled separately, so a
 * plain module variable wouldn't be shared between them.
 */
type WeatherStatus = {
  lastRun: string | null;
  calls: number;
  cells: number;
  lastError: string | null;
};
const shared = globalThis as unknown as { __hudWeatherStatus?: WeatherStatus };
export const weatherStatus: WeatherStatus = (shared.__hudWeatherStatus ??= {
  lastRun: null,
  calls: 0,
  cells: 0,
  lastError: null,
});

/** The archive runs about five days behind; the forecast API covers the gap. */
const ARCHIVE_LAG_DAYS = 6;
/** Forecasts are refreshed at most this often. */
const FORECAST_TTL_MS = 3 * 3_600_000;
/** API calls allowed per sync run (well inside the free tier's limits). */
const MAX_CALLS = 12;

/**
 * Bring every household's map square up to date: history from ten years back
 * (for normal weather) or the household's first bill if earlier, recent days,
 * and the forecast. Only missing days are fetched. Runs from the worker.
 */
export async function syncWeather(
  provider: WeatherProvider | null,
  now = new Date(),
  db: Db = getDb(),
): Promise<{ calls: number; filled: number }> {
  const out = { calls: 0, filled: 0 };
  if (!provider) return out;
  const today = now.toISOString().slice(0, 10);
  const archiveEnd = addDays(today, -ARCHIVE_LAG_DAYS);
  const normalsStart = `${Number(today.slice(0, 4)) - NORMAL_YEARS}-01-01`;
  const homes = db
    .select({ id: household.id, lat: household.latitude, lon: household.longitude })
    .from(household)
    .where(and(isNotNull(household.latitude), isNotNull(household.longitude)))
    .all();
  const cells = new Map<string, { cell: Cell; households: string[]; from: string }>();
  for (const h of homes) {
    const cell = cellOf(h.lat!, h.lon!);
    const first = db
      .select({ start: min(bill.periodStart) })
      .from(bill)
      .where(eq(bill.householdId, h.id))
      .get()?.start;
    const from = first && first < normalsStart ? first : normalsStart;
    const c = cells.get(cell.key) ?? { cell, households: [], from };
    c.households.push(h.id);
    if (from < c.from) c.from = from;
    cells.set(cell.key, c);
  }
  weatherStatus.cells = cells.size;
  for (const { cell, households, from } of cells.values()) {
    try {
      // History: fetch the missing stretches (one call covers years).
      for (const [a, b] of missingRanges(cell.key, from, archiveEnd, db)) {
        if (out.calls >= MAX_CALLS) break;
        out.calls++;
        storeDays(cell.key, await provider.history(cell.lat, cell.lon, a, b), 'archive', db);
      }
      // Recent days and the forecast, a few times a day.
      const fetched = db
        .select({ at: max(weatherForecast.fetchedAt) })
        .from(weatherForecast)
        .where(eq(weatherForecast.cell, cell.key))
        .get()?.at;
      if (
        out.calls < MAX_CALLS &&
        (!fetched || now.getTime() - Date.parse(fetched) > FORECAST_TTL_MS)
      ) {
        out.calls++;
        const days = await provider.recentAndForecast(cell.lat, cell.lon, ARCHIVE_LAG_DAYS + 1, 8);
        storeDays(
          cell.key,
          days.filter((d) => d.date < today),
          'recent',
          db,
        );
        replaceForecast(
          cell.key,
          days.filter((d) => d.date >= today),
          db,
        );
      }
      for (const id of households) out.filled += fillBillWeather(id, db);
      weatherStatus.lastError = null;
    } catch (e) {
      weatherStatus.lastError = (e as Error).message;
      console.error(`[weather] ${cell.key}:`, (e as Error).message);
    }
  }
  weatherStatus.lastRun = now.toISOString();
  weatherStatus.calls += out.calls;
  return out;
}

/** Stretches of days between from and to (inclusive) with no stored weather. */
export function missingRanges(
  cell: string,
  from: string,
  to: string,
  db: Db = getDb(),
): [string, string][] {
  if (to < from) return [];
  const have = new Set(weatherDays(cell, from, to, db).map((d) => d.date));
  const out: [string, string][] = [];
  let start: string | null = null;
  for (let d = from; d <= to; d = addDays(d, 1)) {
    if (!have.has(d)) start ??= d;
    else if (start) {
      out.push([start, addDays(d, -1)]);
      start = null;
    }
  }
  if (start) out.push([start, to]);
  return out;
}
