import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { Legend } from '@/components/charts/legend';
import { MonthlyBars } from '@/components/charts/monthly-bars';
import { Badge, Card, EmptyState, LinkButton, PageHeader, Stat } from '@/components/ui';
import { pageContext } from '@/lib/context';
import { darkVariant } from '@/lib/palette';
import { listServices } from '@/lib/services';
import { dashboardSummary, hasAnyBills, householdBalances, memberLedger } from '@/lib/stats';
import { documentCounts } from '@/lib/review';
import { nextMonth, projectMonth } from '@/lib/projections';
import { remindersFor, summariseReminders } from '@/lib/reminders';

export default async function HomePage() {
  const { hh, me, money, date, today } = await pageContext();
  const t = await getTranslations('dashboard');
  const shared = hh.splitMode === 'shared';

  if (!hasAnyBills()) {
    const hasServices = listServices().length > 0;
    return (
      <>
        <PageHeader title={t('greeting', { name: me.name })} subtitle={hh.name} />
        <EmptyState
          title={t('empty.title')}
          body={hasServices ? t('empty.body') : t('empty.noServices')}
          action={
            <LinkButton href={hasServices ? '/bills/new' : '/services/new'}>
              {hasServices ? t('empty.addBill') : t('empty.addService')}
            </LinkButton>
          }
        />
      </>
    );
  }

  const s = dashboardSummary(today, hh.fiscalYearStartMonth);
  const proj = projectMonth(nextMonth(today));
  const projMonthName = new Intl.DateTimeFormat(hh.locale, {
    month: 'long',
    timeZone: 'UTC',
  }).format(new Date(`${proj.month}-01T00:00:00Z`));
  const mine = shared ? remindersFor(me.id, today) : [];
  const mineSum = summariseReminders(mine);
  const members = new Map(householdBalances().map((b) => [b.member.id, b.member.name]));
  const ledger = shared ? memberLedger(me.id, today, hh.fiscalYearStartMonth) : null;
  const balances = shared ? householdBalances().filter((b) => b.owed > 0) : [];
  const monthLabel = (m: string) =>
    new Intl.DateTimeFormat(hh.locale, { month: 'short', timeZone: 'UTC' }).format(
      new Date(`${m}-01T00:00:00Z`),
    );
  const series = s.services
    .filter((svc) => s.series.some((r) => (r.byService[svc.id] ?? 0) > 0))
    .map((svc) => ({ id: svc.id, name: svc.name, colour: svc.colour }));
  const digits = 100;
  const rows = s.series.map((r) => ({
    month: r.month,
    label: monthLabel(r.month),
    total: r.total / digits,
    ...Object.fromEntries(series.map((sv) => [sv.id, (r.byService[sv.id] ?? 0) / digits])),
  }));
  const format: Record<string, string> = {};
  for (const r of s.series) {
    format[`${r.month}:total`] = money(r.total);
    for (const sv of series) format[`${r.month}:${sv.id}`] = money(r.byService[sv.id] ?? 0);
  }
  const delta =
    s.lastMonthTotal > 0 ? (s.thisMonth.total - s.lastMonthTotal) / s.lastMonthTotal : null;
  const yoy = s.sameMonthLastYearTotal
    ? (s.thisMonth.total - s.sameMonthLastYearTotal) / s.sameMonthLastYearTotal
    : null;
  const pct = (x: number) =>
    Math.abs(x) < 0.005
      ? '±0%'
      : new Intl.NumberFormat(hh.locale, {
          style: 'percent',
          maximumFractionDigits: 0,
          signDisplay: 'exceptZero',
        }).format(x);
  const thisMonthName = new Intl.DateTimeFormat(hh.locale, {
    month: 'long',
    timeZone: 'UTC',
  }).format(new Date(`${s.thisMonth.month}-01T00:00:00Z`));

  return (
    <>
      <header className="mb-6">
        <h1 className="font-display text-[32px] leading-[1.08] font-semibold tracking-tight sm:text-[40px]">
          {t('greeting', { name: me.name })}
          <br />
          <span className="font-normal text-fg-muted">
            {delta === null
              ? t('greetingLine.first')
              : Math.abs(delta) < 0.02
                ? t('greetingLine.level', { month: thisMonthName })
                : delta > 0
                  ? t('greetingLine.up', {
                      month: thisMonthName,
                      pct: pct(Math.abs(delta)).replace('+', ''),
                    })
                  : t('greetingLine.down', {
                      month: thisMonthName,
                      pct: pct(Math.abs(delta)).replace('+', ''),
                    })}
          </span>
        </h1>
      </header>

      {documentCounts().needs_review > 0 && (
        <Link
          href="/review"
          className="mb-4 flex items-center justify-between rounded-card bg-warning/10 px-5 py-3 text-sm font-medium text-warning"
        >
          <span>{t('reviewBanner', { count: documentCounts().needs_review })}</span>
          <span>{t('reviewLink')} →</span>
        </Link>
      )}
      {shared && (mineSum.overdueCount > 0 || mineSum.soonCount > 0) && (
        <Card className="mb-4 flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="font-display font-semibold">{t('reminders.title')}</span>
            <Link href="/ledger" className="text-sm font-semibold text-accent">
              {t('reminders.open')} →
            </Link>
          </div>
          {mineSum.overdueCount > 0 && (
            <p className="text-sm font-semibold text-danger">
              {t('reminders.overdue', {
                count: mineSum.overdueCount,
                amount: money(mineSum.overdueMinor),
              })}
            </p>
          )}
          {mineSum.soonCount > 0 && (
            <p className="text-sm font-semibold text-warning">
              {t('reminders.soon', { count: mineSum.soonCount, amount: money(mineSum.soonMinor) })}
            </p>
          )}
          <ul className="divide-y divide-border text-sm">
            {mine
              .filter((r) => r.level !== 'upcoming')
              .slice(0, 4)
              .map((r) => (
                <li key={r.share.id} className="flex items-center justify-between py-2">
                  <span>
                    {r.serviceName}
                    <span className="text-fg-muted">
                      {' · '}
                      {r.payerMemberId
                        ? t('reminders.payTo', { name: members.get(r.payerMemberId) ?? '' })
                        : ''}
                      {r.share.paymentReference ? ` · ${r.share.paymentReference}` : ''}
                    </span>
                  </span>
                  <span className="flex items-center gap-3">
                    <span
                      className={
                        r.level === 'overdue' ? 'text-xs text-danger' : 'text-xs text-warning'
                      }
                    >
                      {r.level === 'overdue'
                        ? t('reminders.overdueBy', { days: -r.daysUntilDue })
                        : t('reminders.dueIn', { days: r.daysUntilDue })}
                    </span>
                    <span className="font-semibold tabular-nums">
                      {money(r.share.amountMinor, r.share.currency)}
                    </span>
                  </span>
                </li>
              ))}
          </ul>
        </Card>
      )}
      {s.overdue.length > 0 && (
        <Card className="mb-4 border border-danger/30">
          <p className="font-semibold text-danger">
            {t('overdue.title', { count: s.overdue.length })}
          </p>
          <ul className="mt-2 divide-y divide-border text-sm">
            {s.overdue.map((b) => (
              <li key={b.id}>
                <Link href={`/bills/${b.id}`} className="flex items-center justify-between py-2">
                  <span>
                    {b.service.name}{' '}
                    <span className="text-fg-muted">
                      · {t('overdue.by', { days: -b.daysUntilDue })}
                    </span>
                  </span>
                  <span className="font-semibold tabular-nums">
                    {money(b.amountMinor, b.currency)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <Stat
          hero
          label={t('tiles.thisMonth', { month: thisMonthName })}
          value={money(s.thisMonth.total)}
          hint={
            <>
              {delta !== null
                ? t('tiles.vsLastMonth', { pct: pct(delta) })
                : t('tiles.noLastMonth')}
              {yoy !== null && ` · ${t('tiles.vsLastYear', { pct: pct(yoy) })}`}
            </>
          }
        />
        {shared && ledger ? (
          <Link href="/ledger" className="block text-fg">
            <Stat
              className="h-full transition hover:bg-surface-2"
              label={t('tiles.yourShare')}
              value={money(ledger.owed)}
              tone={ledger.owed > 0 ? 'warning' : 'success'}
              hint={
                <>
                  {ledger.owed > 0
                    ? t('tiles.unpaidShares', { count: ledger.unpaid.length })
                    : t('tiles.allSettled')}
                  {ledger.owedToMe > 0 &&
                    ` · ${t('tiles.owedToYou', { amount: money(ledger.owedToMe) })}`}
                </>
              }
            />
          </Link>
        ) : (
          <Stat
            label={t('tiles.perPersonDay')}
            value={s.costPerPersonPerDay !== null ? money(s.costPerPersonPerDay) : '—'}
            hint={t('tiles.perPersonDayHint', { count: s.activeMemberCount })}
          />
        )}
        <Stat
          label={t('tiles.fiscalYear', { label: s.fiscalYear.label })}
          value={money(s.fiscalYear.total)}
          hint={t('tiles.fiscalYearHint', { from: date(s.fiscalYear.start, 'short') })}
        />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <div className="mb-3 flex items-start justify-between gap-3">
            <div>
              <h2 className="font-semibold">{t('chart.title')}</h2>
              <p className="text-xs text-fg-muted">{t('chart.hint')}</p>
            </div>
          </div>
          <MonthlyBars rows={rows} series={series} format={format} />
          <div className="mt-3">
            <Legend items={series} />
          </div>
        </Card>
        <Card className="lg:col-span-2">
          <h2 className="font-semibold">{t('ranking.title', { label: s.fiscalYear.label })}</h2>
          {s.fiscalYear.byService.length === 0 ? (
            <p className="mt-3 text-sm text-fg-muted">{t('ranking.empty')}</p>
          ) : (
            <ul className="mt-3 flex flex-col gap-3">
              {s.fiscalYear.byService.map((row) => {
                const width = Math.max(
                  4,
                  Math.round((row.minor / s.fiscalYear.byService[0]!.minor) * 100),
                );
                return (
                  <li key={row.service.id}>
                    <div className="flex items-center justify-between text-sm">
                      <span className="flex items-center gap-2">
                        <span
                          className="size-2.5 rounded-sm"
                          style={{
                            background: `light-dark(${row.service.colour}, ${darkVariant(row.service.colour)})`,
                          }}
                        />
                        {row.service.name}
                      </span>
                      <span className="font-semibold tabular-nums">{money(row.minor)}</span>
                    </div>
                    <div className="mt-1 h-1.5 rounded-full bg-surface-2">
                      <div
                        className="h-1.5 rounded-full"
                        style={{
                          width: `${width}%`,
                          background: `light-dark(${row.service.colour}, ${darkVariant(row.service.colour)})`,
                        }}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <h2 className="font-semibold">{t('upcoming.title')}</h2>
          {s.upcoming.length === 0 ? (
            <p className="mt-3 text-sm text-fg-muted">{t('upcoming.empty')}</p>
          ) : (
            <ul className="mt-2 divide-y divide-border text-sm">
              {s.upcoming.map((b) => (
                <li key={b.id}>
                  <Link
                    href={`/bills/${b.id}`}
                    className="flex items-center justify-between gap-3 py-2.5"
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-medium">
                        {b.service.name}{' '}
                        <span className="font-normal text-fg-muted">· {b.service.provider}</span>
                      </span>
                      <span className="text-xs text-fg-muted">
                        {b.daysUntilDue === 0
                          ? t('upcoming.today')
                          : t('upcoming.inDays', { days: b.daysUntilDue })}{' '}
                        · {date(b.dueDate, 'short')}
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-2">
                      {b.isAnomaly && <Badge tone="warning">{t('anomaly.badge')}</Badge>}
                      <span className="font-semibold tabular-nums">
                        {money(b.amountMinor, b.currency)}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
        {shared ? (
          <Card>
            <h2 className="font-semibold">{t('balances.title')}</h2>
            {balances.length === 0 ? (
              <p className="mt-3 text-sm text-success">{t('balances.settled')}</p>
            ) : (
              <ul className="mt-2 divide-y divide-border text-sm">
                {balances.map((b) => (
                  <li key={b.member.id} className="flex items-center justify-between py-2.5">
                    <span className="flex items-center gap-2">
                      <span
                        className="size-2.5 rounded-full"
                        style={{
                          background: `light-dark(${b.member.colour}, ${darkVariant(b.member.colour)})`,
                        }}
                      />
                      {b.member.name}
                      {b.member.id === me.id && (
                        <span className="text-xs text-fg-muted">({t('balances.you')})</span>
                      )}
                    </span>
                    <span>
                      <span className="font-semibold tabular-nums text-warning">
                        {money(b.owed)}
                      </span>
                      <span className="ml-2 text-xs text-fg-muted">
                        {t('balances.bills', { count: b.unpaidCount })}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        ) : (
          <Card>
            <h2 className="font-semibold">{t('anomaly.title')}</h2>
            <AnomalyList items={s.anomalies} money={money} empty={t('anomaly.empty')} />
          </Card>
        )}
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Stat
          hero
          label={t('setAside.title', { month: projMonthName })}
          value={
            proj.setAsideEach !== null ? (
              <>
                {money(proj.setAsideEach)}{' '}
                <span className="text-base font-normal text-fg-muted">{t('setAside.each')}</span>
              </>
            ) : (
              money(proj.totalMinor)
            )
          }
          hint={
            <>
              {t('setAside.household', { amount: money(proj.totalMinor) })}
              {' · '}
              {t(
                `setAside.method.${proj.services.some((p) => p.method === 'seasonal') ? 'seasonal' : proj.services.some((p) => p.method === 'recent') ? 'recent' : proj.services.some((p) => p.method === 'single') ? 'single' : 'none'}`,
              )}
            </>
          }
        />
        {shared && s.anomalies.length > 0 && (
          <Card>
            <h2 className="font-semibold">{t('anomaly.title')}</h2>
            <AnomalyList items={s.anomalies} money={money} empty={t('anomaly.empty')} />
          </Card>
        )}
      </div>
    </>
  );
}

function AnomalyList({
  items,
  money,
  empty,
}: {
  items: {
    id: string;
    service: { name: string };
    anomalyNote: string | null;
    amountMinor: number;
    currency: string;
  }[];
  money: (m: number, c?: string) => string;
  empty: string;
}) {
  if (items.length === 0) return <p className="mt-3 text-sm text-fg-muted">{empty}</p>;
  return (
    <ul className="mt-2 divide-y divide-border text-sm">
      {items.map((b) => (
        <li key={b.id}>
          <Link href={`/bills/${b.id}`} className="flex items-center justify-between gap-3 py-2.5">
            <span>
              <span className="block font-medium">{b.service.name}</span>
              <span className="text-xs text-warning">{b.anomalyNote}</span>
            </span>
            <span className="font-semibold tabular-nums">{money(b.amountMinor, b.currency)}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
