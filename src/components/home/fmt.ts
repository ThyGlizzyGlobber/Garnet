import { formatMoney, formatMoneyParts } from '@/lib/format';
import { daysBetween } from '@/lib/dates';

type T = (key: string, values?: Record<string, string | number | Date>) => string;

/** Formatting for the widgets, bound to the household's locale and currency. */
export function makeFmt(d: { locale: string; currency: string; today: string }, t: T) {
  const dm = new Intl.DateTimeFormat(d.locale, { day: 'numeric', month: 'short', timeZone: 'UTC' });
  const dmy = new Intl.DateTimeFormat(d.locale, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
  const mon = new Intl.DateTimeFormat(d.locale, { month: 'short', timeZone: 'UTC' });
  const monLong = new Intl.DateTimeFormat(d.locale, { month: 'long', timeZone: 'UTC' });
  const dow = new Intl.DateTimeFormat(d.locale, { weekday: 'long', timeZone: 'UTC' });
  const at = (ymd: string) => new Date(`${ymd.length === 7 ? `${ymd}-01` : ymd}T00:00:00Z`);
  const num = new Intl.NumberFormat(d.locale, { maximumFractionDigits: 1 });
  return {
    money: (minor: number, whole = false) => formatMoney(minor, d.currency, d.locale, { whole }),
    moneyParts: (minor: number) => formatMoneyParts(minor, d.currency, d.locale),
    /** "8 Sep", or "8 Sep 2026". */
    date: (ymd: string, withYear = false) => (withYear ? dmy : dm).format(at(ymd)),
    /** "Jun – Aug" (or "Jun – Aug 2026"). */
    range: (from: string, to: string) => `${mon.format(at(from))} – ${mon.format(at(to))}`,
    mon: (ymd: string) => mon.format(at(ymd)),
    monthName: (ymd: string) => monLong.format(at(ymd)),
    weekday: (ymd: string) => dow.format(at(ymd)),
    num: (n: number) => num.format(n),
    /** "+11%", "−18%". */
    pct: (f: number) => `${f > 0 ? '+' : f < 0 ? '−' : ''}${Math.round(Math.abs(f) * 100)}%`,
    /** "Today", "Tomorrow", "In 3 days", "5 days overdue", or the date. */
    rel: (ymd: string) => {
      const n = daysBetween(d.today, ymd);
      if (n === 0) return t('rel.today');
      if (n === 1) return t('rel.tomorrow');
      if (n < 0) return t('rel.overdue', { n: -n });
      if (n <= 7) return t('rel.inDays', { n });
      return dm.format(at(ymd));
    },
    days: (from: string, to: string) => daysBetween(from, to),
  };
}

export type Fmt = ReturnType<typeof makeFmt>;
