import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { Sparkline } from '@/components/charts/sparkline';
import { currentMember } from '@/lib/auth/session';
import { todayIn } from '@/lib/dates';
import { formatDate, formatMoney } from '@/lib/format';
import { getHousehold } from '@/lib/households';
import { darkVariant } from '@/lib/palette';
import { nextMonth, projectMonth } from '@/lib/projections';
import { dashboardSummary, hasAnyBills, householdBalances } from '@/lib/stats';
import { AutoRefresh } from './auto-refresh';

export const dynamic = 'force-dynamic';

const swatch = (c: string) => ({ background: `light-dark(${c}, ${darkVariant(c)})` });

/**
 * Kiosk view for an iPad on the wall, laid out like the approved wall board.
 * Log in once on the device; the session lasts AUTH_SESSION_DAYS. Refreshes every minute.
 */
export default async function WallPage() {
  const hh = getHousehold();
  if (!hh) redirect('/setup');
  if (!(await currentMember())) redirect('/login?next=/wall');
  const t = await getTranslations('wall');
  const today = todayIn(hh.timezone);
  const money = (m: number) => formatMoney(m, hh.currency, hh.locale);
  const shared = hh.splitMode === 'shared';
  const s = hasAnyBills() ? dashboardSummary(today, hh.fiscalYearStartMonth) : null;
  const balances = shared ? householdBalances() : [];
  const next = s ? (s.overdue[0] ?? s.upcoming[0]) : undefined;
  const proj = s ? projectMonth(nextMonth(today)) : null;
  const monthName = (m: string) =>
    new Intl.DateTimeFormat(hh.locale, { month: 'long', timeZone: 'UTC' }).format(
      new Date(`${m}-01T00:00:00Z`),
    );
  const overdue = !!next && next.daysUntilDue < 0;

  return (
    <main className="flex min-h-dvh flex-col gap-[2.4vw] p-[3.6vw] text-fg">
      <AutoRefresh seconds={60} />
      <header className="flex items-baseline justify-between">
        <h1 className="font-display text-[3.4vw] leading-none font-semibold tracking-tight">
          {hh.name}
        </h1>
        <p className="text-[2vw] text-fg-muted">
          {formatDate(`${today}T12:00:00Z`, hh.locale, 'UTC', 'long')}
        </p>
      </header>

      {!s ? (
        <p className="my-auto text-center text-[3vw] text-fg-muted">{t('empty')}</p>
      ) : (
        <div className="grid flex-grow gap-[2.4vw] lg:grid-cols-2">
          <section className="glass flex flex-col justify-between rounded-[2.6vw] p-[3vw]">
            <div className="flex flex-col gap-[0.4vw]">
              <span className="text-[1.9vw] text-fg-muted">{monthName(s.thisMonth.month)}</span>
              <span className="font-display text-[8vw] leading-none font-semibold tracking-[-0.03em] tabular-nums">
                {money(s.thisMonth.total)}
              </span>
            </div>
            <div className="my-[1.6vw]">
              <Sparkline values={s.series.map((r) => r.total)} colour="#5b6f82" height={90} />
            </div>
            <ul className="flex flex-wrap gap-x-[2.2vw] gap-y-[0.6vw] text-[1.7vw] text-fg-muted">
              {s.thisMonth.byService.slice(0, 5).map((r) => (
                <li key={r.service.id} className="flex items-center gap-[0.8vw]">
                  <span className="size-[1.1vw] rounded-[0.3vw]" style={swatch(r.service.colour)} />
                  {r.service.name}{' '}
                  <span className="font-semibold text-fg tabular-nums">{money(r.minor)}</span>
                </li>
              ))}
              {s.thisMonth.byService.length > 5 && (
                <li>{t('legendMore', { count: s.thisMonth.byService.length - 5 })}</li>
              )}
            </ul>
          </section>

          <div className="flex flex-col gap-[2.4vw]">
            <section
              className={`glass flex flex-col gap-[0.5vw] rounded-[2.6vw] p-[3vw] ${overdue ? 'border-danger/40 bg-danger-soft' : ''}`}
            >
              <span className="text-[1.9vw] text-fg-muted">{t('nextDue')}</span>
              {next ? (
                <>
                  <span className="font-display text-[3.8vw] leading-[1.1] font-semibold tracking-tight">
                    {next.service.name}{' '}
                    <span className="text-fg-muted">{money(next.amountMinor)}</span>
                  </span>
                  <span className={`text-[2.1vw] ${overdue ? 'text-danger' : 'text-fg-muted'}`}>
                    {overdue
                      ? t('overdueBy', { days: -next.daysUntilDue })
                      : next.daysUntilDue === 0
                        ? t('dueToday')
                        : t('dueIn', { days: next.daysUntilDue })}
                  </span>
                </>
              ) : (
                <span className="font-display text-[3vw] font-semibold text-success">
                  {t('nothingDue')}
                </span>
              )}
            </section>

            {shared && (
              <section className="glass flex flex-grow flex-col gap-[1.2vw] rounded-[2.6vw] p-[3vw]">
                <span className="text-[1.9vw] text-fg-muted">{t('whoOwes')}</span>
                <ul className="flex flex-col gap-[1vw]">
                  {balances.map((b) => (
                    <li
                      key={b.member.id}
                      className="flex items-center justify-between text-[2.5vw]"
                    >
                      <span className="flex items-center gap-[1vw]">
                        <span
                          className="size-[1.5vw] rounded-full"
                          style={swatch(b.member.colour)}
                        />
                        {b.member.name}
                      </span>
                      <span
                        className={`font-semibold tabular-nums ${b.owed > 0 ? 'text-warning' : 'text-success'}`}
                      >
                        {b.owed > 0 ? money(b.owed) : t('settled')}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        </div>
      )}

      <footer className="flex items-center justify-between text-[1.5vw] text-fg-muted">
        <span>
          {t('footer', {
            label: s?.fiscalYear.label ?? '',
            total: s ? money(s.fiscalYear.total) : '',
          })}
        </span>
        {proj?.setAsideEach !== null && proj?.setAsideEach !== undefined && (
          <span>
            {t('setAside', { amount: money(proj.setAsideEach), month: monthName(proj.month) })}
          </span>
        )}
      </footer>
    </main>
  );
}
