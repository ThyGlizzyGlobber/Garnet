import type { SeasonNotice } from '@/lib/seasons';

/** A translator for the "seasons" messages (next-intl on pages, createTranslator in emails). */
type T = (key: string, vars?: Record<string, string | number>) => string;

const pct = (ratio: number) => Math.round(Math.abs(ratio - 1) * 100);

/**
 * A season-ahead notice as words: a title ("Winter starts in 22 days") and
 * sentences ("Last winter, your Electricity cost 40% more a day than in
 * autumn: about $36.50 more a month at today's rates."). The same words on
 * screen and by email.
 */
export function seasonNoticeText(
  n: SeasonNotice,
  t: T,
  f: { money: (minor: number, currency: string) => string; month: (ym: string) => string },
): { title: string; lines: string[] } {
  const season = t(`name.${n.season}`);
  const lines: string[] = [];
  if (Math.abs(n.costRatio - 1) >= 0.1)
    lines.push(
      t(`${n.basis === 'weather' ? 'normal' : 'cost'}${n.costRatio >= 1 ? 'Up' : 'Down'}`, {
        season,
        service: n.serviceName,
        pct: pct(n.costRatio),
        previous: t(`name.${n.previous}`),
        amount: f.money(Math.abs(n.monthlyImpactMinor), n.currency),
      }),
    );
  if (n.usageRatio !== null && Math.abs(n.usageRatio - 1) >= 0.1)
    lines.push(
      t(`${n.basis === 'weather' ? 'normalUsage' : 'usage'}${n.usageRatio >= 1 ? 'Up' : 'Down'}`, {
        pct: pct(n.usageRatio),
      }),
    );
  if (n.solarRatio !== null && Math.abs(n.solarRatio - 1) >= 0.25)
    lines.push(
      t(`${n.basis === 'weather' ? 'normalSolar' : 'solar'}${n.solarRatio >= 1 ? 'Up' : 'Down'}`, {
        pct: pct(n.solarRatio),
      }),
    );
  if (n.setAsideCovers && n.monthlyImpactMinor > 0)
    lines.push(t('covers', { month: f.month(n.startMonth) }));
  lines.push(n.basis === 'weather' ? t('basisWeather') : t('basis', { year: n.basisYear }));
  return {
    title: t('startsIn', { season: t(`title.${n.season}`), days: n.daysUntil }),
    lines,
  };
}
