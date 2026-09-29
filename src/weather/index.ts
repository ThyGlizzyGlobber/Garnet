import { getEnv } from '@/lib/env';
import { openMeteo } from './open-meteo';
import type { WeatherProvider } from './types';

/** The configured weather provider, or null when weather is off. */
export function weatherProvider(): WeatherProvider | null {
  const env = getEnv();
  return env.WEATHER_PROVIDER === 'off' ? null : openMeteo(env.OPEN_METEO_API_KEY);
}

export type { DailyWeather, WeatherProvider } from './types';
