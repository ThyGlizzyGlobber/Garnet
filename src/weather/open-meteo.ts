import type { DailyWeather, WeatherProvider } from './types';

/**
 * Open-Meteo (https://open-meteo.com, data CC BY 4.0). The free API is for
 * non-commercial use; with a commercial key the same requests go to the
 * "customer-" hosts. History comes from the archive API (ERA5, final after
 * about 5 days); the last few days and the forecast from the forecast API.
 */
export function openMeteo(apiKey?: string | null): WeatherProvider {
  const host = (name: string) => `https://${apiKey ? 'customer-' : ''}${name}.open-meteo.com`;
  const DAILY = [
    'temperature_2m_mean',
    'temperature_2m_min',
    'temperature_2m_max',
    'shortwave_radiation_sum',
    'sunshine_duration',
    'weather_code',
  ];

  async function get(url: URL): Promise<DailyWeather[]> {
    if (apiKey) url.searchParams.set('apikey', apiKey);
    const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
    if (!res.ok) throw new Error(`Open-Meteo ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const body = (await res.json()) as { daily?: Record<string, (number | string | null)[]> };
    const d = body.daily;
    if (!d?.time) return [];
    const num = (key: string, i: number) => {
      const v = d[key]?.[i];
      return typeof v === 'number' && Number.isFinite(v) ? v : null;
    };
    return (d.time as string[]).map((date, i) => {
      const sunshineSeconds = num('sunshine_duration', i);
      return {
        date,
        tempMean: num('temperature_2m_mean', i),
        tempMin: num('temperature_2m_min', i),
        tempMax: num('temperature_2m_max', i),
        radiation: num('shortwave_radiation_sum', i),
        sunshine: sunshineSeconds === null ? null : sunshineSeconds / 3600,
        code: num('weather_code', i),
        rainChance: num('precipitation_probability_max', i),
      };
    });
  }

  const base = (url: URL, lat: number, lon: number) => {
    url.searchParams.set('latitude', lat.toFixed(2));
    url.searchParams.set('longitude', lon.toFixed(2));
    // Days in the place's own local time, so "a day" matches the bills.
    url.searchParams.set('timezone', 'auto');
    return url;
  };

  return {
    name: 'open-meteo',
    history(lat, lon, from, to) {
      const url = base(new URL(`${host('archive-api')}/v1/archive`), lat, lon);
      url.searchParams.set('start_date', from);
      url.searchParams.set('end_date', to);
      url.searchParams.set('daily', DAILY.join(','));
      return get(url);
    },
    recentAndForecast(lat, lon, pastDays, forecastDays) {
      const url = base(new URL(`${host('api')}/v1/forecast`), lat, lon);
      url.searchParams.set('past_days', String(pastDays));
      url.searchParams.set('forecast_days', String(forecastDays));
      url.searchParams.set('daily', [...DAILY, 'precipitation_probability_max'].join(','));
      return get(url);
    },
  };
}
