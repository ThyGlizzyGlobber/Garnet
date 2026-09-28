import { getEnv } from '@/lib/env';
import { openMeteo } from './open-meteo';
import type { WeatherProvider } from './types';

let override: WeatherProvider | null | undefined;

/** The configured weather provider, or null when weather is off. */
export function weatherProvider(): WeatherProvider | null {
  if (override !== undefined) return override;
  const env = getEnv();
  return env.WEATHER_PROVIDER === 'off' ? null : openMeteo(env.OPEN_METEO_API_KEY);
}

/** Tests: use a stand-in provider (undefined restores the configured one). */
export function setWeatherProvider(p: WeatherProvider | null | undefined): void {
  override = p;
}

export type { DailyWeather, WeatherProvider } from './types';
