import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { openDb, type Db } from '@/db/client';
import { bill as billTable } from '@/db/schema';
import { runMigrations } from '@/db/migrate';
import { createBill } from '@/lib/bills';
import { addDays, daysInclusive } from '@/lib/dates';
import { createHousehold } from '@/lib/households';
import { setHouseholdLocation } from '@/lib/location';
import { createMember } from '@/lib/members';
import { projectMonth } from '@/lib/projections';
import { seasonAhead } from '@/lib/seasons';
import { createService } from '@/lib/services';
import {
  cellOf,
  coolingDegrees,
  forecastFor,
  heatingDegrees,
  missingRanges,
  syncWeather,
  weatherNormals,
} from '@/lib/weather';
import { fitWeather, serviceWeather, weatherAdjusted } from '@/lib/weather-model';
import { weatherWeek } from '@/lib/weather-week';
import type { DailyWeather, WeatherProvider } from '@/weather';

let dir: string;
let db: Db;
let close: () => void;

beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hud-weather-'));
  runMigrations(dir);
  const opened = openDb(dir);
  db = opened.db;
  close = () => opened.sqlite.close();
});

afterAll(() => {
  close();
  fs.rmSync(dir, { recursive: true, force: true });
});

/** A southern town's mean temperature by month; winter 2026 two degrees colder. */
const MONTH_TEMP = [22, 22, 19, 16, 12, 9, 8, 9, 11, 14, 17, 20];
const MONTH_SUN = [27, 24, 19, 14, 10, 8, 9, 12, 17, 21, 25, 27];
function temp(date: string): number {
  const m = Number(date.slice(5, 7));
  const colder = date.startsWith('2026') && m >= 6 && m <= 8 ? 2 : 0;
  return MONTH_TEMP[m - 1]! - colder;
}
const dayOf = (date: string): DailyWeather => ({
  date,
  tempMean: temp(date),
  tempMin: temp(date) - 5,
  tempMax: temp(date) + 5,
  radiation: MONTH_SUN[Number(date.slice(5, 7)) - 1]!,
  sunshine: 6,
  code: 3,
  rainChance: 20,
});
const NOW = new Date('2026-08-20T00:00:00Z');
const TODAY = '2026-08-20';

function fakeProvider() {
  const calls: string[] = [];
  const provider: WeatherProvider = {
    name: 'fake',
    async history(_lat, _lon, from, to) {
      calls.push(`history ${from}..${to}`);
      const out: DailyWeather[] = [];
      for (let d = from; d <= to; d = addDays(d, 1)) out.push(dayOf(d));
      return out;
    },
    async recentAndForecast(_lat, _lon, past, forecast) {
      calls.push(`recent ${past}+${forecast}`);
      const out: DailyWeather[] = [];
      for (let d = addDays(TODAY, -past); d < addDays(TODAY, forecast); d = addDays(d, 1))
        out.push(dayOf(d));
      return out;
    },
  };
  return { provider, calls };
}

const hddPerDay = (m: string) => Math.max(0, 18 - temp(`${m}-15`));

let n = 0;
/** A Bendigo household whose electricity cost per day = $1.50 + 25c per heating degree-day. */
function household(months: string[]) {
  const hh = createHousehold(
    {
      name: `Weather ${++n}`,
      currency: 'AUD',
      locale: 'en-AU',
      timezone: 'Australia/Melbourne',
      fiscalYearStartMonth: 7,
      splitMode: 'shared',
    },
    db,
  );
  setHouseholdLocation(hh.id, { country: 'AU', postalCode: '3550' }, db);
  const jo = createMember(hh.id, { name: 'Jo', role: 'owner', activeFrom: '2025-01-01' }, db);
  const power = createService(
    hh.id,
    {
      typeSlug: 'electricity',
      name: 'Electricity',
      provider: 'Red Energy',
      usageUnit: 'kWh',
      payerMemberId: jo.id,
    },
    db,
  );
  for (const m of months) {
    const start = `${m}-01`;
    const end = addDays(`${m}-${m === '2026-02' || m === '2025-02' ? '28' : '28'}`, 0);
    const days = daysInclusive(start, end);
    createBill(
      hh.id,
      {
        serviceId: power.id,
        amountMinor: Math.round((150 + 25 * hddPerDay(m)) * days),
        usageQuantity: Math.round((5 + 1 * hddPerDay(m)) * days * 10) / 10,
        usageUnit: 'kWh',
        periodStart: start,
        periodEnd: end,
        dueDate: addDays(end, 14),
        source: 'manual',
      },
      db,
    );
  }
  return { hh, power };
}
const monthsBetween = (from: string, to: string) => {
  const out: string[] = [];
  for (
    let [y, m] = from.split('-').map(Number) as [number, number];
    `${y}-${String(m).padStart(2, '0')}` <= to;
  ) {
    out.push(`${y}-${String(m).padStart(2, '0')}`);
    m = m === 12 ? 1 : m + 1;
    if (m === 1) y++;
  }
  return out;
};

describe('weather basics', () => {
  it('group places into 0.1° squares and count degree-days from 18 °C', () => {
    expect(cellOf(-36.7256, 144.3174)).toEqual({ key: '-36.7,144.3', lat: -36.7, lon: 144.3 });
    expect(heatingDegrees(8)).toBe(10);
    expect(heatingDegrees(20)).toBe(0);
    expect(coolingDegrees(25)).toBe(7);
  });

  it('fits how a bill follows the weather, and never with negative weather terms', () => {
    const points = [0, 2, 4, 7, 9, 11].map((h) => ({
      days: 30,
      hddPerDay: h,
      cddPerDay: 0,
      value: 200 + 30 * h,
    }));
    const fit = fitWeather(points)!;
    expect(fit.base).toBeCloseTo(200, 3);
    expect(fit.heating).toBeCloseTo(30, 3);
    expect(fit.cooling).toBe(0);
    expect(fit.r2).toBeCloseTo(1, 5);
  });
});

describe('keeping weather up to date', () => {
  it('fetches ten years once, then only the recent days and forecast when stale', async () => {
    const { hh } = household(monthsBetween('2025-06', '2026-07'));
    const { provider, calls } = fakeProvider();
    const first = await syncWeather(provider, NOW, db);
    expect(calls).toEqual(['history 2016-01-01..2026-08-14', 'recent 7+8']);
    expect(first.filled).toBe(14);
    const cell = cellOf(-36.7256, 144.3174).key;
    expect(missingRanges(cell, '2016-01-01', '2026-08-19', db)).toEqual([]);
    expect(forecastFor(cell, TODAY, db).map((d) => d.date)).toHaveLength(8);
    // Half an hour later: nothing to fetch.
    await syncWeather(provider, new Date(NOW.getTime() + 30 * 60_000), db);
    expect(calls).toHaveLength(2);
    // Each bill carries its period's degree-days.
    const july25 = db
      .select()
      .from(billTable)
      .where(eq(billTable.householdId, hh.id))
      .all()
      .find((b) => b.periodStart === '2025-07-01')!;
    expect(july25.hdd).toBeCloseTo(10 * 28, 5); // 8 °C every day of 28
    expect(july25.solarMj).toBeCloseTo(9 * 28, 5);
    // Normal July: ten years at 8 °C and one at 6 °C.
    expect(weatherNormals(cell, db).get(7)!.hdd).toBeCloseTo((10 * 10 + 12) / 11, 1);
  });
});

describe('weather-aware comparisons and forecasts', () => {
  it('separate the weather from the household: same habits, colder winter', async () => {
    const { hh, power } = household(monthsBetween('2025-06', '2026-07'));
    await syncWeather(fakeProvider().provider, NOW, db);
    const sw = serviceWeather(hh.id, power.id, db)!;
    expect(sw.cost!.heating).toBeCloseTo(25, 0);
    expect(sw.usage!.heating).toBeCloseTo(1, 1);
    const adj = weatherAdjusted(hh.id, power.id, db)!;
    expect(adj.against).toBe('lastYear');
    expect(adj.measure).toBe('usage');
    expect(adj.actual).toBeGreaterThan(0.1); // used more…
    expect(adj.weather!.kind).toBe('colder'); // …in a 20% colder July…
    expect(adj.weather!.pct).toBeCloseTo(0.2, 5);
    expect(Math.abs(adj.adjusted)).toBeLessThan(0.01); // …so, adjusted, the same.
  });

  it('forecast a month with no bill from last year from normal weather', async () => {
    const { hh, power } = household(monthsBetween('2025-10', '2026-08'));
    await syncWeather(fakeProvider().provider, NOW, db);
    // September's bill (1–28 Sep, due in October) has no bill from last September.
    const oct = projectMonth(hh.id, '2026-10', db, TODAY).services.find(
      (s) => s.service.id === power.id,
    )!;
    expect(oct.method).toBe('weather');
    const [sept] = oct.expected;
    expect(sept?.periodStart).toBe('2026-09-01');
    // Normal September (11 °C): $1.50 + 7 × $0.25 a day, for its 28 days, in full.
    expect(sept!.amountMinor).toBeCloseTo((150 + 25 * 7) * 28, -1);
  });

  it('warn about the coming season from normal weather when last year has no bills', async () => {
    const { hh, power } = household(monthsBetween('2025-10', '2026-08'));
    await syncWeather(fakeProvider().provider, NOW, db);
    const [notice] = seasonAhead(hh.id, TODAY, db);
    expect(notice).toMatchObject({ serviceId: power.id, season: 'spring', basis: 'weather' });
    expect(notice!.costRatio).toBeLessThan(0.8); // spring is far cheaper to heat
  });

  it('put a number on this week’s weather', async () => {
    const { hh } = household(monthsBetween('2025-10', '2026-08'));
    await syncWeather(fakeProvider().provider, NOW, db);
    const week = weatherWeek(hh.id, TODAY, db)!;
    expect(week.place).toBe('Bendigo, VIC 3550');
    expect(week.days).toHaveLength(7);
    expect(week.days.every((d) => d.heating)).toBe(true);
    // A 7 °C week in a month that's normally ~9 °C: more heating than usual.
    expect(week.impact).toMatchObject({ kind: 'heating', vsNormal: true });
    expect(week.impact!.minor).toBeGreaterThan(0);
  });

  it('stay quiet without a postcode or weather', () => {
    const hh = createHousehold(
      {
        name: 'No postcode',
        currency: 'AUD',
        locale: 'en-AU',
        timezone: 'Australia/Melbourne',
        fiscalYearStartMonth: 7,
        splitMode: 'shared',
      },
      db,
    );
    expect(weatherWeek(hh.id, TODAY, db)).toBeNull();
  });
});
