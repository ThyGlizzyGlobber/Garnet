import { getDb, type Db } from '@/db/client';
import { getHousehold } from '@/lib/households';
import { describeLocation } from '@/lib/location';
import { listServices } from '@/lib/services';
import {
  coolingDegrees,
  forecastFor,
  heatingDegrees,
  householdCell,
  weatherNormals,
} from '@/lib/weather';
import { serviceWeather } from '@/lib/weather-model';

export interface WeatherWeekDay {
  date: string;
  tempMin: number | null;
  tempMax: number | null;
  code: number | null;
  rainChance: number | null;
  /** The day's mean temperature calls for heating (or cooling). */
  heating: boolean;
  cooling: boolean;
}

export interface WeatherWeek {
  place: string | null;
  days: WeatherWeekDay[];
  /**
   * What the week's weather adds to (or takes off) the household's seasonal
   * bills, compared with a normal week this month (or, without ten years of
   * weather, the weather-driven cost itself). Minor units, household currency.
   */
  impact: { minor: number; kind: 'heating' | 'cooling'; vsNormal: boolean } | null;
}

/** The dashboard's weather card: the next seven days and their bill impact. */
export function weatherWeek(
  householdId: string,
  today: string,
  db: Db = getDb(),
): WeatherWeek | null {
  const hh = getHousehold(householdId, db);
  const cell = hh && householdCell(hh);
  if (!hh || !cell) return null;
  const forecast = forecastFor(cell.key, today, db).slice(0, 7);
  if (!forecast.length) return null;
  const days = forecast.map((d) => ({
    date: d.date,
    tempMin: d.tempMin,
    tempMax: d.tempMax,
    code: d.code,
    rainChance: d.rainChance,
    heating: d.tempMean !== null && heatingDegrees(d.tempMean) > 0,
    cooling: d.tempMean !== null && coolingDegrees(d.tempMean) > 0,
  }));

  const fits = listServices(householdId, {}, db)
    .filter((s) => s.seasonal)
    .map((s) => serviceWeather(householdId, s.id, db)?.cost)
    .filter((f) => !!f);
  let impact: WeatherWeek['impact'] = null;
  if (fits.length) {
    let heat = 0;
    let cool = 0;
    for (const d of forecast) {
      if (d.tempMean === null) continue;
      for (const f of fits) {
        heat += f.heating * heatingDegrees(d.tempMean);
        cool += f.cooling * coolingDegrees(d.tempMean);
      }
    }
    const normal = weatherNormals(cell.key, db).get(Number(today.slice(5, 7)));
    let minor = heat + cool;
    if (normal)
      for (const f of fits)
        minor -= forecast.length * (f.heating * normal.hdd + f.cooling * normal.cdd);
    minor = Math.round(minor);
    if (Math.abs(minor) >= 100)
      impact = { minor, kind: heat >= cool ? 'heating' : 'cooling', vsNormal: !!normal };
  }
  return { place: describeLocation(hh), days, impact };
}

/** A WMO weather code as a message key under "weather.code". */
export function weatherCodeKey(code: number | null): string {
  if (code === null) return 'unknown';
  if (code === 0) return 'clear';
  if (code <= 2) return 'partly';
  if (code === 3) return 'cloudy';
  if (code === 45 || code === 48) return 'fog';
  if (code >= 51 && code <= 57) return 'drizzle';
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return 'rain';
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'snow';
  if (code >= 95) return 'storm';
  return 'unknown';
}
