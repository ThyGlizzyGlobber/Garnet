import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { Icon } from '@/components/app/icons';
import { TrendLine } from '@/components/charts/trend-line';
import { Ring } from '@/components/ui/ring';
import { currentMember } from '@/lib/auth/session';
import { todayIn } from '@/lib/dates';
import { formatDate, formatMoney } from '@/lib/format';
import { getHousehold, isSetUp } from '@/lib/households';
import { darkVariant } from '@/lib/palette';
import { nextMonth, projectMonth } from '@/lib/projections';
import { dashboardSummary, hasAnyBills, householdBalances, settlementRate } from '@/lib/stats';
import { AutoRefresh } from './auto-refresh';

export const dynamic = 'force-dynamic';

const swatch = (c: string) => ({ background: `light-dark(${c}, ${darkVariant(c)})` });
const avatar = (colour: string) => ({
  background: `linear-gradient(135deg, light-dark(${colour}, ${darkVariant(colour)}), var(--color-accent))`,
});

/**
 * Kiosk view for an iPad on the wall. Log in once on the device; the session
 * lasts AUTH_SESSION_DAYS. Refreshes every minute.
 */
export default async function WallPage() {
  if (!isSetUp()) redirect('/setup');
  const me = await currentMember();
  if (!me) redirect('/login?next=/wall');
  const hh = getHousehold(me.householdId);
  if (!hh) redirect('/login?next=/wall');
  const t = await getTranslations('wall');
  const today = todayIn(hh.timezone);
  const money = (m: number) => formatMoney(m, hh.currency, hh.locale);
  const shared = hh.splitMode === 'shared';
  const s = hasAnyBills(hh.id) ? dashboardSummary(hh.id, today, hh.fiscalYearStartMonth) : null;
  const balances = shared ? householdBalances(hh.id) : [];
  const next = s ? (s.overdue[0] ?? s.upcoming[0]) : undefined;
  const proj = s ? projectMonth(hh.id, nextMonth(today)) : null;
  const projNow = s ? projectMonth(hh.id, s.thisMonth.month) : null;
  const settled = s && shared ? settlementRate(hh.id, s.thisMonth.month) : null;
  const monthName = (m: string, style: 'short' | 'long' = 'long') =>
    new Intl.DateTimeFormat(hh.locale, { month: style, timeZone: 'UTC' }).format(
      new Date(`${m}-01T00:00:00Z`),
    );
  const overdue = !!next && next.daysUntilDue < 0;
  const budgetPct =
    s && projNow && projNow.totalMinor > 0
      ? Math.round((s.thisMonth.total / projNow.totalMinor) * 100)
      : 0;
  const points = s
    ? s.series.map((r) => ({
        key: r.month,
        label: monthName(r.month, 'short'),
        value: r.total / 100,
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

        {!s ? (
          <p className="my-auto text-center text-[3vw] text-fg-muted">{t('empty')}</p>
        ) : (
          <div className="grid flex-grow gap-[2vw] lg:grid-cols-[1.35fr_1fr]">
            <div className="flex flex-col gap-[2vw]">
              <section className="glass flex items-center gap-[2.4vw] rounded-[2.2vw] bg-accent-soft p-[2.4vw]">
                <Ring id="wall-budget" pct={budgetPct} size={150} stroke={14}>
                  <span className="flex flex-col items-center leading-none">
                    <span className="font-display text-[2.2vw] font-semibold tabular-nums">
                      {budgetPct}%
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
                        <span
                          className="size-[0.9vw] rounded-[0.25vw]"
                          style={swatch(r.service.colour)}
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
                  <TrendLine points={points} height={230} id="wall" />
                </div>
              </section>
            </div>

            <div className="flex flex-col gap-[2vw]">
              <section
                className={`glass flex items-center gap-[1.6vw] rounded-[2.2vw] p-[2.2vw] ${overdue ? 'border-danger/40 bg-danger-soft' : ''}`}
              >
                {next && (
                  <span
                    className="glow-disc size-[5.2vw] shrink-0"
                    style={{
                      color: `light-dark(${next.service.colour}, ${darkVariant(next.service.colour)})`,
                      ['--glow' as string]: `light-dark(${next.service.colour}, ${darkVariant(next.service.colour)})`,
                    }}
                  >
                    <Icon name={next.service.type.icon} width={34} height={34} />
                  </span>
                )}
                <div className="min-w-0">
                  <span className="text-[1.4vw] text-fg-muted">{t('nextDue')}</span>
                  {next ? (
                    <>
                      <p className="font-display text-[2.8vw] leading-[1.1] font-semibold tracking-tight">
                        {next.service.name}{' '}
                        <span className="text-fg-muted tabular-nums">
                          {money(next.amountMinor)}
                        </span>
                      </p>
                      <p
                        className={`text-[1.5vw] ${overdue ? 'font-semibold text-danger' : 'text-fg-muted'}`}
                      >
                        {overdue
                          ? t('overdueBy', { days: -next.daysUntilDue })
                          : next.daysUntilDue === 0
                            ? t('dueToday')
                            : t('dueIn', { days: next.daysUntilDue })}
                      </p>
                    </>
                  ) : (
                    <p className="font-display text-[2.4vw] font-semibold text-success">
                      {t('nothingDue')}
                    </p>
                  )}
                </div>
              </section>

              {shared && (
                <section className="glass flex flex-grow flex-col gap-[1vw] rounded-[2.2vw] p-[2.2vw]">
                  <div className="flex items-center justify-between">
                    <span className="text-[1.4vw] text-fg-muted">{t('whoOwes')}</span>
                    {settled && settled.total > 0 && (
                      <span className="flex items-center gap-[0.8vw] text-[1.1vw] text-fg-muted">
                        <Ring
                          id="wall-settled"
                          pct={settled.pct ?? 0}
                          size={54}
                          stroke={7}
                          from="var(--color-success)"
                          to="var(--color-accent-2)"
                        >
                          <span className="text-[0.85vw] font-bold tabular-nums">
                            {settled.pct}%
                          </span>
                        </Ring>
                        {t('settled')}
                      </span>
                    )}
                  </div>
                  <ul className="flex flex-col gap-[0.9vw]">
                    {balances.map((b) => (
                      <li
                        key={b.member.id}
                        className="flex items-center justify-between text-[2vw]"
                      >
                        <span className="flex items-center gap-[1vw]">
                          <span
                            className="grid size-[2.6vw] place-items-center rounded-full text-[1.1vw] font-bold text-white"
                            style={avatar(b.member.colour)}
                          >
                            {b.member.name.slice(0, 1).toUpperCase()}
                          </span>
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
                    {t('setAsideLabel', { month: proj ? monthName(proj.month) : '' })}
                  </span>
                  <span className="font-display text-[2.6vw] leading-none font-semibold tabular-nums">
                    {proj?.setAsideEach !== null && proj?.setAsideEach !== undefined
                      ? money(proj.setAsideEach)
                      : '—'}{' '}
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
      </div>
    </main>
  );
}
