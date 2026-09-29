/** One day of weather at a place. Temperatures in °C; radiation MJ/m²; sunshine in hours. */
export interface DailyWeather {
  date: string;
  tempMean: number | null;
  tempMin: number | null;
  tempMax: number | null;
  radiation: number | null;
  sunshine: number | null;
  /** WMO weather code. */
  code: number | null;
  /** Forecasts only: highest chance of rain that day, %. */
  rainChance?: number | null;
}

/**
 * Where weather comes from (scope S3). Swappable, like extractors: Open-Meteo
 * first, anything with daily history and a short forecast can replace it.
 */
export interface WeatherProvider {
  name: string;
  /** Final daily weather for a date range (the most recent days may not be available yet). */
  history(lat: number, lon: number, from: string, to: string): Promise<DailyWeather[]>;
  /** The last `pastDays` days (provisional) and the next `forecastDays` days. */
  recentAndForecast(
    lat: number,
    lon: number,
    pastDays: number,
    forecastDays: number,
  ): Promise<DailyWeather[]>;
}
