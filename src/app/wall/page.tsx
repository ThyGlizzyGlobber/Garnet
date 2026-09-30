import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { Icon } from '@/components/app/icons';
import { TrendLine } from '@/components/charts/trend-line';
import { Avatar, IconDisc, Swatch } from '@/components/ui/colour';
import { Ring } from '@/components/ui/ring';
import { authState, pathFor } from '@/lib/auth/session';
import { todayIn } from '@/lib/dates';
import { formatDate, formatMoney, formatMonth, formatWeekday, toMajor } from '@/lib/format';
import { wallView } from '@/lib/home';
import { getHousehold } from '@/lib/households';
import { weatherCodeKey } from '@/lib/weather-codes';
import { weatherWeek } from '@/lib/weather-week';
import { AutoRefresh } from './auto-refresh';

export const dynamic = 'force-dynamic';

/**
 * Kiosk view for an iPad on the wall. Log in once on the device; the session
 * lasts AUTH_SESSION_DAYS. Refreshes every minute.
 */
export default async function WallPage() {
  const state = await authState();
  if (state.kind !== 'ok') redirect(pathFor(state, '/wall')!);
  const me = state.member;
  const hh = getHousehold(me.householdId);
  if (!hh) redirect('/login?next=/wall');
  const t = await getTranslations('wall');
  const today = todayIn(hh.timezone);
  const money = (m: number) => formatMoney(m, hh.currency, hh.locale);
  const monthName = (m: string, style: 'short' | 'long' = 'long') =>
    formatMonth(m, hh.locale, style);
  const v = wallView(hh, today);
  const s = v?.summary ?? null;
  const next = v?.nextDue ?? null;
  const overdue = !!next?.overdue;
  // Weather strip (scope S3): only for households with a postcode and a forecast.
  const week = weatherWeek(hh.id, today);
  const tw = await getTranslations('weather');
  const deg = (d: number | null) => (d === null ? '–' : `${Math.round(d)}°`);
  const points = s
    ? s.series.map((r) => ({
        key: r.month,
        label: monthName(r.month, 'short'),
        value: toMajor(r.total, hh.currency),
        text: money(r.total),
      }))
    : [];

  return (
    <main className="flex min-h-dvh flex-col p-[2vw] text-fg">
      <AutoRefresh seconds={60} />
      <div className="window flex flex-grow flex-col gap-[2vw] p-[2.8vw]">
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-[1.2vw]">
            <span className="grid size-[3.4vw] place-items-center rounded-[1vw] bg-accent text-accent-fg">
              <Icon name="home" width={22} height={22} />
            </span>
            <h1 className="font-display text-[3vw] leading-none font-semibold tracking-tight">
              {hh.name}
            </h1>
          </div>
          <div className="flex items-center gap-[1.5vw]">
            <p className="text-[1.7vw] text-fg-muted">
              {formatDate(`${today}T12:00:00Z`, hh.locale, 'UTC', 'long')}
            </p>
            <Link
              href="/"
              className="glass-nav flex items-center gap-[0.6vw] rounded-full px-[1.4vw] py-[0.7vw] text-[1.2vw] font-semibold text-fg"
              aria-label={t('back')}
            >
              <Icon name="home" width={18} height={18} />
              {t('back')}
            </Link>
          </div>
        </header>

        {!v || !s ? (
          <p className="my-auto text-center text-[3vw] text-fg-muted">{t('empty')}</p>
        ) : (
          <div className="grid flex-grow gap-[2vw] lg:grid-cols-[1.35fr_1fr]">
            <div className="flex flex-col gap-[2vw]">
              <section className="glass flex items-center gap-[2.4vw] rounded-[2.2vw] bg-accent-soft p-[2.4vw]">
                <Ring id="wall-budget" pct={v.budgetPct} size={150} stroke={14}>
                  <span className="flex flex-col items-center leading-none">
                    <span className="font-display text-[2.2vw] font-semibold tabular-nums">
                      {v.budgetPct}%
                    </span>
                    <span className="mt-[0.3vw] text-[0.9vw] font-semibold tracking-wide text-fg-muted uppercase">
                      {monthName(s.thisMonth.month, 'short')}
                    </span>
                  </span>
                </Ring>
                <div className="min-w-0 flex-1">
                  <span className="text-[1.6vw] text-fg-muted">{monthName(s.thisMonth.month)}</span>
                  <p className="font-display text-[6.4vw] leading-none font-semibold tracking-[-0.03em] tabular-nums">
                    {money(s.thisMonth.total)}
                  </p>
                  <ul className="mt-[1.2vw] flex flex-wrap gap-x-[1.8vw] gap-y-[0.4vw] text-[1.3vw] text-fg-muted">
                    {s.thisMonth.byService.slice(0, 5).map((r) => (
                      <li key={r.service.id} className="flex items-center gap-[0.6vw]">
                        <Swatch
                          colour={r.service.colour}
                          className="size-[0.9vw] rounded-[0.25vw]"
                        />
                        {r.service.name}{' '}
                        <span className="font-semibold text-fg tabular-nums">{money(r.minor)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </section>
              <section className="glass flex flex-grow flex-col rounded-[2.2vw] p-[2vw]">
                <span className="mb-[0.6vw] text-[1.3vw] text-fg-muted">{t('chart')}</span>
                <div className="flex-grow">
                  <TrendLine
                    points={points}
                    height={week ? 190 : 230}
                    id="wall"
                    label={t('chart')}
                  />
                </div>
              </section>
            </div>

            <div className="flex flex-col gap-[2vw]">
              <section
                className={`glass flex items-center gap-[1.6vw] rounded-[2.2vw] p-[2.2vw] ${overdue ? 'border-danger/40 bg-danger-soft' : ''}`}
              >
                {next && (
                  <IconDisc
                    icon={next.bill.service.type.icon}
                    colour={next.bill.service.colour}
                    variant="glow"
                    size="5.2vw"
                    iconSize={34}
                  />
                )}
                <div className="min-w-0">
                  <span className="text-[1.4vw] text-fg-muted">{t('nextDue')}</span>
                  {next ? (
                    <>
                      <p className="font-display text-[2.8vw] leading-[1.1] font-semibold tracking-tight">
                        {next.bill.service.name}{' '}
                        <span className="text-fg-muted tabular-nums">
                          {money(next.due.amountMinor)}
                        </span>
                      </p>
                      <p
                        className={`text-[1.5vw] ${overdue ? 'font-semibold text-danger' : 'text-fg-muted'}`}
                      >
                        {overdue
                          ? t('overdueBy', { days: -next.bill.daysUntilDue })
                          : next.bill.daysUntilDue === 0
                            ? t('dueToday')
                            : t('dueIn', { days: next.bill.daysUntilDue })}
                      </p>
                    </>
                  ) : (
                    <p className="font-display text-[2.4vw] font-semibold text-success">
                      {t('nothingDue')}
                    </p>
                  )}
                </div>
              </section>

              {v.shared && (
                <section className="glass flex flex-grow flex-col gap-[1vw] rounded-[2.2vw] p-[2.2vw]">
                  <div className="flex items-center justify-between">
                    <span className="text-[1.4vw] text-fg-muted">{t('whoOwes')}</span>
                    {v.settled && v.settled.total > 0 && (
                      <span className="flex items-center gap-[0.8vw] text-[1.1vw] text-fg-muted">
                        <Ring
                          id="wall-settled"
                          pct={v.settled.pct ?? 0}
                          size={54}
                          stroke={7}
                          from="var(--color-success)"
                          to="var(--color-accent-2)"
                        >
                          <span className="text-[0.85vw] font-bold tabular-nums">
                            {v.settled.pct}%
                          </span>
                        </Ring>
                        {t('settled')}
                      </span>
                    )}
                  </div>
                  <ul className="flex flex-col gap-[0.9vw]">
                    {v.balances.map((b) => (
                      <li
                        key={b.member.id}
                        className="flex items-center justify-between text-[2vw]"
                      >
                        <span className="flex items-center gap-[1vw]">
                          <Avatar
                            name={b.member.name}
                            colour={b.member.colour}
                            className="size-[2.6vw] text-[1.1vw]"
                          />
                          {b.member.name}
                        </span>
                        <span
                          className={`font-semibold tabular-nums ${b.owed > 0 ? 'text-warning' : 'text-success'}`}
                        >
                          {b.owed > 0 ? money(b.owed) : t('settledLabel')}
                        </span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              <section className="glass flex items-center justify-between rounded-[2.2vw] bg-accent-soft p-[1.8vw]">
                <span className="flex flex-col">
                  <span className="text-[1.2vw] text-fg-muted">
                    {t('setAsideLabel', { month: monthName(v.setAside.month) })}
                  </span>
                  <span className="font-display text-[2.6vw] leading-none font-semibold tabular-nums">
                    {v.setAside.each !== null ? money(v.setAside.each) : '—'}{' '}
                    <span className="text-[1.2vw] font-normal text-fg-muted">{t('each')}</span>
                  </span>
                </span>
                <span className="text-right text-[1.1vw] text-fg-muted">
                  {t('footer', { label: s.fiscalYear.label, total: money(s.fiscalYear.total) })}
                </span>
              </section>
            </div>
          </div>
        )}

        {week && (
          <section
            className="glass flex items-center gap-[1.6vw] rounded-[1.6vw] px-[1.6vw] py-[0.9vw]"
            aria-label={tw('title')}
          >
            <div className="flex min-w-[15vw] flex-col leading-tight">
              <span className="truncate text-[0.95vw] text-fg-muted">
                {week.place ?? tw('title')}
              </span>
              <span className="text-[1.3vw] tabular-nums">
                <span className="font-display text-[1.9vw] font-semibold">
                  {deg(week.days[0]!.tempMax)}
                </span>{' '}
                <span className="text-fg-muted">
                  {deg(week.days[0]!.tempMin)} · {tw(`code.${weatherCodeKey(week.days[0]!.code)}`)}
                </span>
              </span>
            </div>
            <ol className="grid flex-grow grid-cols-6 gap-[0.6vw] text-center leading-tight">
              {week.days.slice(1, 7).map((d) => (
                <li
                  key={d.date}
                  className={`rounded-[0.8vw] py-[0.4vw] ${d.heating ? 'bg-accent-soft' : d.cooling ? 'bg-warning-soft' : ''}`}
                >
                  <span className="block text-[1vw] tabular-nums">
                    <span className="font-semibold">{formatWeekday(d.date, hh.locale)}</span>{' '}
                    {deg(d.tempMax)} <span className="text-fg-muted">{deg(d.tempMin)}</span>
                  </span>
                  <span className="block text-[0.85vw] text-fg-muted">
                    {tw(`code.${weatherCodeKey(d.code)}`)}
                  </span>
                </li>
              ))}
            </ol>
            <div className="flex max-w-[20vw] flex-col text-right leading-tight">
              {week.impact && (
                <span className="text-[1vw]">
                  {tw(
                    `impact.${week.impact.kind}.${week.impact.vsNormal ? (week.impact.minor > 0 ? 'more' : 'less') : 'total'}`,
                    { amount: money(Math.abs(week.impact.minor)) },
                  )}
                </span>
              )}
              <span className="text-[0.7vw] text-fg-muted">{tw('attribution')}</span>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
