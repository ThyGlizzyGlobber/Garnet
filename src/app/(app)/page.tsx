import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { Icon } from '@/components/app/icons';
import { TrendLine } from '@/components/charts/trend-line';
import { Badge, Card, EmptyState, LinkButton, PageHeader } from '@/components/ui';
import { InlineAction } from '@/components/ui/form';
import { Arc, Ring } from '@/components/ui/ring';
import { billsWithAlerts, getBill } from '@/lib/bills';
import { pageContext } from '@/lib/context';
import { darkVariant } from '@/lib/palette';
import { addMonths } from '@/lib/periods';
import { nextMonth, projectMonth } from '@/lib/projections';
import { remindersFor, summariseReminders } from '@/lib/reminders';
import { documentCounts } from '@/lib/review';
import { listServices } from '@/lib/services';
import { householdUsage } from '@/lib/consumption';
import { seasonAhead } from '@/lib/seasons';
import { weatherWeek } from '@/lib/weather-week';
import { WeatherCard } from '@/components/app/weather-card';
import { cookies } from 'next/headers';
import { LOCATION_PROMPT_COOKIE } from '@/lib/location';
import { dismissLocationPromptAction } from './settings/actions';
import { SeasonAhead } from '@/components/app/season-ahead';
import { unitLabel } from '@/lib/units';
import { ChangeText, formatQty } from '@/components/app/usage';
import {
  dashboardSummary,
  hasAnyBills,
  householdBalances,
  memberLedger,
  settlementRate,
} from '@/lib/stats';
import { toggleSharePaidAction } from './bills/actions';

const swatch = (c: string) => ({ background: `light-dark(${c}, ${darkVariant(c)})` });
const tile = 'glass lift rounded-card p-5 sm:p-6';

export default async function HomePage() {
  const { hh, me, money, date, today } = await pageContext();
  const t = await getTranslations('dashboard');
  const shared = hh.splitMode === 'shared';

  if (!hasAnyBills(hh.id)) {
    const hasServices = listServices(hh.id).length > 0;
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

  const s = dashboardSummary(hh.id, today, hh.fiscalYearStartMonth);
  const usage = householdUsage(hh.id);
  const seasons = seasonAhead(hh.id, today);
  const week = weatherWeek(hh.id, today);
  const tl = await getTranslations('location');
  const askForPostcode =
    me.role === 'owner' &&
    !hh.isDemo &&
    !hh.postalCode &&
    !(await cookies()).get(LOCATION_PROMPT_COOKIE);
  const services = listServices(hh.id);
  const tu = await getTranslations('usage');
  const projNow = projectMonth(hh.id, s.thisMonth.month);
  const proj = projectMonth(hh.id, nextMonth(today));
  const forecast = Array.from({ length: 6 }, (_, i) =>
    projectMonth(hh.id, addMonths(s.thisMonth.month, i + 1)),
  );
  const ledger = shared ? memberLedger(hh.id, me.id, today, hh.fiscalYearStartMonth) : null;
  const balances = shared ? householdBalances(hh.id) : [];
  const mine = shared ? remindersFor(hh.id, me.id, today) : [];
  const mineSum = summariseReminders(mine);
  const settled = shared ? settlementRate(hh.id, s.thisMonth.month) : null;
  const reviewCount = documentCounts(hh.id).needs_review;
  const alerts = billsWithAlerts(hh.id);

  const monthName = (m: string, style: 'short' | 'long' = 'short') =>
    new Intl.DateTimeFormat(hh.locale, { month: style, timeZone: 'UTC' }).format(
      new Date(`${m}-01T00:00:00Z`),
    );
  const thisMonthName = monthName(s.thisMonth.month, 'long');
  const pct = (x: number) =>
    Math.abs(x) < 0.005
      ? '±0%'
      : new Intl.NumberFormat(hh.locale, {
          style: 'percent',
          maximumFractionDigits: 0,
          signDisplay: 'exceptZero',
        }).format(x);
  const delta =
    s.lastMonthTotal > 0 ? (s.thisMonth.total - s.lastMonthTotal) / s.lastMonthTotal : null;
  const yoy = s.sameMonthLastYearTotal
    ? (s.thisMonth.total - s.sameMonthLastYearTotal) / s.sameMonthLastYearTotal
    : null;
  const budgetPct =
    projNow.totalMinor > 0 ? Math.round((s.thisMonth.total / projNow.totalMinor) * 100) : 0;
  const sharePct =
    ledger && ledger.totalThisFy > 0
      ? Math.round((ledger.paidThisFy / ledger.totalThisFy) * 100)
      : 0;

  const serviceName = new Map(s.services.map((svc) => [svc.id, svc.name]));
  const points = s.series.map((r) => {
    const top = Object.entries(r.byService)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([id, v]) => `${serviceName.get(id) ?? '?'} ${money(v)}`)
      .join(' · ');
    return {
      key: r.month,
      label: monthName(r.month),
      value: r.total / 100,
      text: money(r.total),
      detail: top || undefined,
    };
  });

  const nextBill = s.overdue[0] ?? s.upcoming[0];
  const nextDetail = nextBill ? getBill(hh.id, nextBill.id) : null;
  const myShare = nextDetail?.shares.find((sh) => sh.memberId === me.id) ?? null;
  const projMethod = proj.services.some((p) => p.method === 'seasonal')
    ? 'seasonal'
    : proj.services.some((p) => p.method === 'weather')
      ? 'weather'
      : proj.services.some((p) => p.method === 'recent')
        ? 'recent'
        : proj.services.some((p) => p.method === 'single')
          ? 'single'
          : 'none';
  const maxForecast = Math.max(...forecast.map((f) => f.totalMinor), 1);

  return (
    <>
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <h1 className="font-display text-[32px] leading-[1.06] font-semibold tracking-tight sm:text-[42px]">
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
        <div className="flex flex-wrap gap-2">
          <span className="rounded-full bg-accent px-4 py-2 text-sm font-semibold text-accent-fg">
            {thisMonthName}
          </span>
          <Link
            href="/bills"
            className="rounded-full bg-surface-2 px-4 py-2 text-sm font-semibold text-fg-muted hover:text-fg"
          >
            {s.fiscalYear.label}
          </Link>
          <Link
            href="/services"
            className="rounded-full bg-surface-2 px-4 py-2 text-sm font-semibold text-fg-muted hover:text-fg"
          >
            {t('chips.services', { count: s.services.length })}
          </Link>
          {shared && (
            <Link
              href="/members"
              className="rounded-full bg-surface-2 px-4 py-2 text-sm font-semibold text-fg-muted hover:text-fg"
            >
              {t('chips.members', { count: s.activeMemberCount })}
            </Link>
          )}
        </div>
      </header>

      {alerts.map((b) => (
        <Link
          key={b.id}
          href={`/bills/${b.id}`}
          className="mb-4 flex items-center justify-between gap-3 rounded-card bg-danger-soft px-5 py-3 text-sm font-semibold text-danger"
        >
          <span>
            {t(`alertBanner.${b.alertKind}`, {
              provider: b.service.provider,
              due: date(b.dueDate),
            })}
          </span>
          <span>{t('alertBanner.open')} →</span>
        </Link>
      ))}
      {reviewCount > 0 && (
        <Link
          href="/review"
          className="mb-4 flex items-center justify-between rounded-card bg-warning-soft px-5 py-3 text-sm font-semibold text-warning"
        >
          <span>{t('reviewBanner', { count: reviewCount })}</span>
          <span>{t('reviewLink')} →</span>
        </Link>
      )}

      {shared && (mineSum.overdueCount > 0 || mineSum.soonCount > 0) && (
        <Card className="mb-4 flex flex-col gap-2 border-warning/30">
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
        </Card>
      )}

      {/* Row 1: instruments */}
      <div
        className={`grid gap-4 ${shared ? 'lg:grid-cols-[1.3fr_1fr_1fr]' : 'lg:grid-cols-[1.3fr_1fr]'}`}
      >
        <section className={`${tile} flex items-center gap-6 bg-accent-soft`}>
          <Ring id="budget" pct={budgetPct} size={132} stroke={13}>
            <span className="flex flex-col items-center leading-none">
              <span className="font-display text-[26px] font-semibold tabular-nums">
                {budgetPct}%
              </span>
              <span className="mt-1 text-[10px] font-semibold tracking-wide text-fg-muted uppercase">
                {thisMonthName.slice(0, 3)}
              </span>
            </span>
          </Ring>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">
              {t('tiles.thisMonth', { month: thisMonthName })}
            </p>
            <p className="font-display text-[38px] leading-none font-semibold tracking-tight tabular-nums sm:text-[44px]">
              {money(s.thisMonth.total)}
            </p>
            <p className="mt-2 flex flex-wrap items-center gap-2 text-xs text-fg-muted">
              <span className="rounded-full bg-surface-2 px-2 py-0.5 font-bold text-fg">
                {delta !== null ? pct(delta) : '—'}
              </span>
              {delta !== null
                ? t('tiles.vsLastMonth', { pct: '' }).replace('  ', ' ').trim()
                : t('tiles.noLastMonth')}
              {yoy !== null && ` · ${t('tiles.vsLastYear', { pct: pct(yoy) })}`}
            </p>
            <p className="mt-1 text-xs text-fg-muted">
              {budgetPct > 100
                ? t('budgetRing.over')
                : t('budgetRing.label', { month: thisMonthName })}{' '}
              · {money(projNow.totalMinor)}
            </p>
          </div>
        </section>

        {shared && ledger ? (
          <Link href="/ledger" className={`${tile} flex flex-col text-fg`}>
            <div className="flex items-start justify-between">
              <p className="text-sm font-semibold">{t('tiles.yourShare')}</p>
              <Badge tone={ledger.owed > 0 ? 'warning' : 'success'}>
                {ledger.owed > 0
                  ? t('tiles.unpaidShares', { count: ledger.unpaid.length })
                  : t('tiles.allSettled')}
              </Badge>
            </div>
            <div className="mt-2 flex flex-col items-center">
              <Arc
                id="share"
                pct={sharePct}
                width={190}
                stroke={13}
                from="var(--color-accent-2)"
                to="var(--color-accent)"
              />
              <span className="-mt-9 flex flex-col items-center leading-none">
                <span
                  className={`font-display text-[32px] font-semibold tabular-nums ${ledger.owed > 0 ? 'text-warning' : 'text-success'}`}
                >
                  {money(ledger.owed)}
                </span>
                <span className="mt-1 text-[11px] text-fg-muted">
                  {t('tiles.owedToYou', { amount: money(ledger.owedToMe) })}
                </span>
              </span>
            </div>
            <p className="mt-3 text-center text-xs text-fg-muted">
              {t('tiles.paidOfYear', { pct: sharePct, label: s.fiscalYear.label })}
            </p>
          </Link>
        ) : (
          <section className={`${tile} flex flex-col justify-between`}>
            <p className="text-sm font-semibold">{t('tiles.perPersonDay')}</p>
            <p className="font-display text-[40px] leading-none font-semibold tracking-tight tabular-nums">
              {s.costPerPersonPerDay !== null ? money(s.costPerPersonPerDay) : '—'}
            </p>
            <p className="text-xs text-fg-muted">
              {t('tiles.perPersonDayHint', { count: s.activeMemberCount })}
            </p>
          </section>
        )}

        <section className={`${tile} flex flex-col`}>
          <div className="flex items-start justify-between">
            <p className="text-sm font-semibold">{t('forecast.title')}</p>
            <span className="text-xs text-fg-muted">{t('forecast.hint')}</span>
          </div>
          <div className="mt-4 flex flex-1 items-end justify-between gap-2">
            {forecast.map((f, i) => (
              <div key={f.month} className="flex flex-1 flex-col items-center gap-1.5">
                <span className="text-[11px] font-semibold tabular-nums">
                  {money(f.totalMinor, hh.currency).replace(/\.\d+$/, '')}
                </span>
                <div
                  className={`w-full max-w-9 rounded-full ${i === 0 ? 'bg-accent' : 'hatch'}`}
                  style={{
                    height: `${Math.max(10, Math.round((f.totalMinor / maxForecast) * 90))}px`,
                  }}
                />
                <span className="text-[11px] text-fg-muted">{monthName(f.month)}</span>
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs text-fg-muted">
            {t('setAside.title', { month: monthName(proj.month, 'long') })}:{' '}
            <span className="font-semibold text-fg">
              {proj.setAsideEach !== null
                ? `${money(proj.setAsideEach)} ${t('setAside.each')}`
                : money(proj.totalMinor)}
            </span>{' '}
            · {t(`setAside.method.${projMethod}`)}
          </p>
        </section>
      </div>

      {/* Row 2: chart · next due · bills */}
      <div className="mt-4 grid gap-4 lg:grid-cols-[1.6fr_1fr_1fr]">
        <section className={`${tile} flex flex-col gap-3`}>
          <div className="flex items-start justify-between">
            <div>
              <h2 className="font-display text-lg font-semibold">{t('chart.title')}</h2>
              <p className="text-xs text-fg-muted">{t('chart.hint')}</p>
            </div>
            <span className="rounded-full bg-surface-2 px-3 py-1 text-xs font-semibold text-fg-muted">
              12 mo
            </span>
          </div>
          <TrendLine points={points} id="dash" />
        </section>

        <section
          className={`${tile} flex flex-col gap-2 ${nextBill && nextBill.daysUntilDue < 0 ? 'bg-danger-soft' : ''}`}
        >
          <div className="flex items-center justify-between">
            <h2 className="font-display text-lg font-semibold">{t('nextDue.title')}</h2>
            {nextBill && (
              <span
                className="grid size-10 place-items-center rounded-full text-white"
                style={swatch(nextBill.service.colour)}
              >
                <Icon name={nextBill.service.type.icon} width={18} height={18} />
              </span>
            )}
          </div>
          {nextBill && nextDetail ? (
            <>
              <Link
                href={`/bills/${nextBill.id}`}
                className="font-display text-[24px] leading-tight font-semibold"
              >
                {nextBill.service.name}
              </Link>
              <p className="font-display text-[34px] leading-none font-semibold tracking-tight tabular-nums">
                {money(nextBill.amountMinor, nextBill.currency)}
              </p>
              <p className="text-sm text-fg-muted">
                {nextBill.daysUntilDue < 0 ? (
                  <span className="font-semibold text-danger">
                    {t('billsTile.overdue', { days: -nextBill.daysUntilDue })}
                  </span>
                ) : (
                  t('billsTile.due', { date: date(nextBill.dueDate, 'short') })
                )}
                {myShare &&
                  ` · ${t('nextDue.yourShare', { amount: money(myShare.amountMinor, myShare.currency) })}`}
              </p>
              <div className="mt-auto pt-3">
                {myShare && !myShare.paidAt ? (
                  <InlineAction
                    action={toggleSharePaidAction}
                    hidden={{ shareId: myShare.id, billId: nextBill.id, paid: 'true' }}
                    label={t('nextDue.markPaid')}
                  />
                ) : myShare ? (
                  <Badge tone="success">{t('nextDue.paid')}</Badge>
                ) : (
                  <LinkButton href={`/bills/${nextBill.id}`} variant="secondary">
                    {t('nextDue.viewBill')}
                  </LinkButton>
                )}
              </div>
            </>
          ) : (
            <p className="text-sm text-success">{t('nextDue.none')}</p>
          )}
        </section>

        <section className={`${tile} flex flex-col gap-3`}>
          <div className="flex items-center justify-between">
            <h2 className="font-display text-lg font-semibold">{t('billsTile.title')}</h2>
            <Link href="/bills" className="text-xs font-bold text-accent">
              {t('billsTile.all', { count: s.upcoming.length + s.overdue.length })}
            </Link>
          </div>
          {[...s.overdue, ...s.upcoming].slice(0, 5).map((b) => (
            <Link key={b.id} href={`/bills/${b.id}`} className="flex items-center gap-3">
              <span
                className="grid size-9 shrink-0 place-items-center rounded-xl text-white"
                style={swatch(b.service.colour)}
              >
                <Icon name={b.service.type.icon} width={16} height={16} />
              </span>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-sm font-semibold">{b.service.name}</span>
                <span
                  className={`truncate text-xs ${b.daysUntilDue < 0 ? 'text-danger' : b.isAnomaly ? 'text-warning' : 'text-fg-muted'}`}
                >
                  {b.daysUntilDue < 0
                    ? t('billsTile.overdue', { days: -b.daysUntilDue })
                    : b.isAnomaly
                      ? t('billsTile.unusual', { note: b.anomalyNote ?? '' })
                      : t('billsTile.due', { date: date(b.dueDate, 'short') })}
                </span>
              </span>
              <span className="text-sm font-semibold tabular-nums">
                {money(b.amountMinor, b.currency)}
              </span>
            </Link>
          ))}
          {s.upcoming.length + s.overdue.length === 0 && (
            <p className="text-sm text-fg-muted">{t('upcoming.empty')}</p>
          )}
        </section>
      </div>

      {/* Row 3: people · settled · ranking */}
      <div className="mt-4 grid gap-4 lg:grid-cols-[1.6fr_1fr_1fr]">
        {shared ? (
          <section className={`${tile} flex flex-col gap-3`}>
            <h2 className="font-display text-lg font-semibold">{t('balances.title')}</h2>
            {balances.map((b) => {
              const overdue =
                b.owed > 0 &&
                remindersFor(hh.id, b.member.id, today).some((r) => r.level === 'overdue');
              return (
                <div key={b.member.id} className="flex items-center gap-3 text-sm">
                  <span
                    className="grid size-10 place-items-center rounded-full text-sm font-bold text-white shadow-inner"
                    style={{
                      background: `linear-gradient(135deg, light-dark(${b.member.colour}, ${darkVariant(b.member.colour)}), var(--color-accent))`,
                    }}
                  >
                    {b.member.name.slice(0, 1).toUpperCase()}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col leading-tight">
                    <span className="font-semibold">
                      {b.member.name}{' '}
                      {b.member.id === me.id && (
                        <span className="font-normal text-fg-muted">({t('balances.you')})</span>
                      )}
                    </span>
                    <span className="text-xs text-fg-muted">
                      {b.owed > 0
                        ? t('balances.owes', { amount: money(b.owed), count: b.unpaidCount })
                        : t('balances.allSettled')}
                    </span>
                  </span>
                  <Badge tone={b.owed === 0 ? 'success' : overdue ? 'danger' : 'warning'}>
                    {b.owed === 0
                      ? t('balances.settledChip')
                      : overdue
                        ? t('balances.overdue')
                        : t('balances.pending')}
                  </Badge>
                </div>
              );
            })}
          </section>
        ) : (
          <section className={tile}>
            <h2 className="font-display text-lg font-semibold">{t('anomaly.title')}</h2>
            <AnomalyList items={s.anomalies} money={money} empty={t('anomaly.empty')} />
          </section>
        )}

        {shared && (
          <section className={`${tile} flex flex-col items-center gap-2`}>
            <h2 className="self-start font-display text-lg font-semibold">{t('settled.title')}</h2>
            <Ring
              id="settled"
              pct={settled?.pct ?? 0}
              size={140}
              stroke={14}
              from="var(--color-success)"
              to="var(--color-accent-2)"
            >
              <span className="font-display text-[30px] font-semibold tabular-nums">
                {settled?.pct === null || settled === null ? '—' : `${settled.pct}%`}
              </span>
            </Ring>
            <span className="text-center text-xs text-fg-muted">
              {settled && settled.total > 0
                ? `${t('settled.count', { paid: settled.paid, total: settled.total })} · ${t('settled.hint', { month: thisMonthName })}`
                : t('settled.none')}
            </span>
          </section>
        )}

        <section className={tile}>
          <h2 className="font-display text-lg font-semibold">
            {t('ranking.title', { label: s.fiscalYear.label })}
          </h2>
          <Ranking rows={s.fiscalYear.byService} money={money} empty={t('ranking.empty')} />
        </section>

        {shared && s.anomalies.length > 0 && (
          <section className={`${tile} lg:col-span-3`}>
            <h2 className="font-display text-lg font-semibold">{t('anomaly.title')}</h2>
            <AnomalyList items={s.anomalies} money={money} empty={t('anomaly.empty')} />
          </section>
        )}

        {askForPostcode && (
          <section className={`${tile} flex flex-col gap-2 lg:col-span-3`}>
            <h2 className="font-display text-lg font-semibold">{tl('prompt.title')}</h2>
            <p className="text-sm text-fg-muted">{tl('prompt.body')}</p>
            <div className="flex flex-wrap items-center gap-2">
              <LinkButton href="/settings#location">{tl('prompt.action')}</LinkButton>
              <InlineAction
                action={dismissLocationPromptAction}
                label={tl('prompt.dismiss')}
                variant="ghost"
              />
            </div>
          </section>
        )}

        {week && (
          <WeatherCard
            week={week}
            locale={hh.locale}
            money={(m) => money(m)}
            className="lg:col-span-3"
          />
        )}

        {seasons.length > 0 && (
          <SeasonAhead
            notices={seasons}
            locale={hh.locale}
            money={money}
            className="lg:col-span-3"
          />
        )}

        {usage.length > 0 && (
          <section className={`${tile} lg:col-span-3`}>
            <h2 className="font-display text-lg font-semibold">{tu('dashboard.title')}</h2>
            <p className="text-xs text-fg-muted">{tu('dashboard.hint')}</p>
            <ul className="mt-3 grid gap-x-8 gap-y-1 sm:grid-cols-2 lg:grid-cols-3">
              {usage.map((u) => {
                const svc = services.find((x) => x.id === u.serviceId);
                if (!svc) return null;
                return (
                  <li key={u.serviceId}>
                    <Link
                      href={`/services/${u.serviceId}`}
                      className="flex items-baseline justify-between gap-3 border-b border-border py-2 text-sm hover:text-accent"
                    >
                      <span className="flex items-center gap-2">
                        <span className="size-2.5 rounded-sm" style={swatch(svc.colour)} />
                        {svc.name}
                      </span>
                      <span className="text-right">
                        <span className="font-semibold tabular-nums">
                          {tu('perDay', {
                            qty: formatQty(u.latest.perDay!, hh.locale),
                            unit: unitLabel(u.unit),
                          })}
                        </span>
                        <ChangeText
                          className="block text-xs"
                          change={u.previous?.usage}
                          words={(pct) => ({
                            more: tu('more', { pct }),
                            less: tu('less', { pct }),
                            same: tu('same'),
                          })}
                        />
                        {u.limit && u.limit.usage.pct !== null && u.limit.usage.pct > 0 && (
                          <span className="block text-xs text-warning">
                            {tu('overLimit', { pct: Math.round(u.limit.usage.pct * 100) })}
                          </span>
                        )}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        )}
      </div>
    </>
  );
}

function Ranking({
  rows,
  money,
  empty,
}: {
  rows: { service: { id: string; name: string; colour: string }; minor: number }[];
  money: (m: number) => string;
  empty: string;
}) {
  if (rows.length === 0) return <p className="mt-3 text-sm text-fg-muted">{empty}</p>;
  const max = rows[0]!.minor;
  return (
    <ul className="mt-3 flex flex-col gap-3">
      {rows.map((row) => (
        <li key={row.service.id}>
          <div className="flex items-center justify-between text-sm">
            <span className="flex items-center gap-2">
              <span className="size-2.5 rounded-sm" style={swatch(row.service.colour)} />
              {row.service.name}
            </span>
            <span className="font-semibold tabular-nums">{money(row.minor)}</span>
          </div>
          <div className="mt-1 h-2 rounded-full bg-surface-2">
            <div
              className="h-2 rounded-full"
              style={{
                width: `${Math.max(4, Math.round((row.minor / max) * 100))}%`,
                ...swatch(row.service.colour),
              }}
            />
          </div>
        </li>
      ))}
    </ul>
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
