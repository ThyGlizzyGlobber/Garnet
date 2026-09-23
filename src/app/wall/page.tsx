import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { Sparkline } from '@/components/charts/sparkline';
import { currentMember } from '@/lib/auth/session';
import { todayIn } from '@/lib/dates';
import { formatDate, formatMoney } from '@/lib/format';
import { getHousehold } from '@/lib/households';
import { darkVariant } from '@/lib/palette';
import { dashboardSummary, hasAnyBills, householdBalances } from '@/lib/stats';
import { AutoRefresh } from './auto-refresh';

export const dynamic = 'force-dynamic';

/**
 * Kiosk view for an iPad on the wall. Log in once on the device; the session
 * lasts AUTH_SESSION_DAYS. Refreshes itself every minute.
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
  const monthName = new Intl.DateTimeFormat(hh.locale, { month: 'long', timeZone: 'UTC' }).format(
    new Date(`${today.slice(0, 7)}-01T00:00:00Z`),
  );

  return (
    <main className="flex min-h-dvh flex-col bg-bg p-[4vw] text-fg">
      <AutoRefresh seconds={60} />
      <header className="flex items-baseline justify-between">
        <h1 className="text-[3.5vw] font-semibold tracking-tight">{hh.name}</h1>
        <p className="text-[2vw] text-fg-muted">
          {formatDate(`${today}T12:00:00Z`, hh.locale, 'UTC', 'long')}
        </p>
      </header>

      {!s ? (
        <p className="my-auto text-center text-[3vw] text-fg-muted">{t('empty')}</p>
      ) : (
        <div className="my-auto grid gap-[3vw] lg:grid-cols-2">
          <section className="rounded-[2vw] bg-surface p-[3vw] shadow-card">
            <p className="text-[2vw] text-fg-muted">{t('thisMonth', { month: monthName })}</p>
            <p className="text-[7vw] leading-none font-semibold tabular-nums">
              {money(s.thisMonth.total)}
            </p>
            <div className="mt-[2vw]">
              <Sparkline values={s.series.map((r) => r.total)} height={90} />
            </div>
            <ul className="mt-[1.5vw] flex flex-wrap gap-x-[2vw] gap-y-[0.5vw] text-[1.6vw] text-fg-muted">
              {s.thisMonth.byService.slice(0, 5).map((r) => (
                <li key={r.service.id} className="flex items-center gap-[0.6vw]">
                  <span
                    className="size-[1vw] rounded-sm"
                    style={{
                      background: `light-dark(${r.service.colour}, ${darkVariant(r.service.colour)})`,
                    }}
                  />
                  {r.service.name} <span className="text-fg">{money(r.minor)}</span>
                </li>
              ))}
            </ul>
          </section>

          <section className="flex flex-col gap-[3vw]">
            <div
              className={`rounded-[2vw] p-[3vw] shadow-card ${next && next.daysUntilDue < 0 ? 'bg-danger/15' : 'bg-surface'}`}
            >
              <p className="text-[2vw] text-fg-muted">{t('nextDue')}</p>
              {next ? (
                <>
                  <p className="text-[4vw] leading-tight font-semibold">
                    {next.service.name}{' '}
                    <span className="text-fg-muted">{money(next.amountMinor)}</span>
                  </p>
                  <p className="text-[2vw] text-fg-muted">
                    {next.daysUntilDue < 0
                      ? t('overdueBy', { days: -next.daysUntilDue })
                      : next.daysUntilDue === 0
                        ? t('dueToday')
                        : t('dueIn', { days: next.daysUntilDue })}
                  </p>
                </>
              ) : (
                <p className="text-[3vw] font-semibold text-success">{t('nothingDue')}</p>
              )}
            </div>

            {shared && (
              <div className="rounded-[2vw] bg-surface p-[3vw] shadow-card">
                <p className="text-[2vw] text-fg-muted">{t('whoOwes')}</p>
                <ul className="mt-[1vw] flex flex-col gap-[1vw]">
                  {balances.map((b) => (
                    <li
                      key={b.member.id}
                      className="flex items-center justify-between text-[2.6vw]"
                    >
                      <span className="flex items-center gap-[1vw]">
                        <span
                          className="size-[1.6vw] rounded-full"
                          style={{
                            background: `light-dark(${b.member.colour}, ${darkVariant(b.member.colour)})`,
                          }}
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
              </div>
            )}
          </section>
        </div>
      )}
      <footer className="text-[1.4vw] text-fg-muted">
        {t('footer', {
          label: s?.fiscalYear.label ?? '',
          total: s ? money(s.fiscalYear.total) : '',
        })}
      </footer>
    </main>
  );
}
