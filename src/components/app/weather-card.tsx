import { getTranslations } from 'next-intl/server';
import { formatWeekday } from '@/lib/format';
import { weatherCodeKey, type WeatherWeek } from '@/lib/weather-week';

/**
 * The week ahead at the household's postcode, and what it means for the
 * seasonal bills. Self-contained tile, plain on purpose (restyled later).
 */
export async function WeatherCard({
  week,
  locale,
  money,
  className = '',
}: {
  week: WeatherWeek;
  locale: string;
  money: (minor: number) => string;
  className?: string;
}) {
  const t = await getTranslations('weather');
  const deg = (v: number | null) => (v === null ? '–' : `${Math.round(v)}°`);
  const impact = week.impact;
  return (
    <section className={`glass rounded-card p-5 ${className}`} aria-label={t('title')}>
      <h2 className="font-display text-lg font-semibold">
        {week.place ? t('titleAt', { place: week.place }) : t('title')}
      </h2>
      {impact && (
        <p className="mt-1 text-sm">
          {t(
            `impact.${impact.kind}.${impact.vsNormal ? (impact.minor > 0 ? 'more' : 'less') : 'total'}`,
            { amount: money(Math.abs(impact.minor)) },
          )}
        </p>
      )}
      <ol className="mt-3 grid grid-cols-7 gap-1 text-center text-xs">
        {week.days.map((d) => (
          <li
            key={d.date}
            className={`rounded-xl px-1 py-2 ${d.heating ? 'bg-accent-soft' : d.cooling ? 'bg-warning-soft' : ''}`}
          >
            <span className="block font-semibold">{formatWeekday(d.date, locale)}</span>
            <span className="mt-1 block text-fg-muted">{t(`code.${weatherCodeKey(d.code)}`)}</span>
            <span className="mt-1 block tabular-nums">
              <span className="font-semibold">{deg(d.tempMax)}</span>{' '}
              <span className="text-fg-muted">{deg(d.tempMin)}</span>
            </span>
            {d.rainChance !== null && d.rainChance >= 30 && (
              <span className="mt-0.5 block text-fg-muted tabular-nums">{d.rainChance}%</span>
            )}
          </li>
        ))}
      </ol>
      <p className="mt-3 text-[11px] text-fg-muted">
        {t('legend')} · {t('attribution')}
      </p>
    </section>
  );
}
