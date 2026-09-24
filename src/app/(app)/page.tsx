import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { Icon } from '@/components/app/icons';
import { Legend } from '@/components/charts/legend';
import { MonthlyBars } from '@/components/charts/monthly-bars';
import { Badge, Card, EmptyState, LinkButton, PageHeader, Stat } from '@/components/ui';
import { InlineAction } from '@/components/ui/form';
import { getBill } from '@/lib/bills';
import { pageContext } from '@/lib/context';
import { darkVariant } from '@/lib/palette';
import { nextMonth, projectMonth } from '@/lib/projections';
import { remindersFor, summariseReminders } from '@/lib/reminders';
import { documentCounts } from '@/lib/review';
import { listServices } from '@/lib/services';
import {
  dashboardSummary,
  hasAnyBills,
  householdBalances,
  memberLedger,
  settlementRate,
} from '@/lib/stats';
import { toggleSharePaidAction } from './bills/actions';

const swatch = (c: string) => ({ background: `light-dark(${c}, ${darkVariant(c)})` });

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
  const ledger = shared ? memberLedger(me.id, today, hh.fiscalYearStartMonth) : null;
  const balances = shared ? householdBalances() : [];
  const memberNames = new Map(balances.map((b) => [b.member.id, b.member.name]));
  const mine = shared ? remindersFor(me.id, today) : [];
  const mineSum = summariseReminders(mine);
  const settled = shared ? settlementRate(s.thisMonth.month) : null;
  const reviewCount = documentCounts().needs_review;

  const monthName = (m: string, style: 'short' | 'long' = 'short') =>
    new Intl.DateTimeFormat(hh.locale, { month: style, timeZone: 'UTC' }).format(
      new Date(`${m}-01T00:00:00Z`),
    );
  const thisMonthName = monthName(s.thisMonth.month, 'long');
  const projMonthName = monthName(proj.month, 'long');
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

  // Chart data (major units for the axis; preformatted strings for the tooltip).
  const series = s.services
    .filter((svc) => s.series.some((r) => (r.byService[svc.id] ?? 0) > 0))
    .map((svc) => ({ id: svc.id, name: svc.name, colour: svc.colour }));
  const rows = s.series.map((r) => ({
    month: r.month,
    label: monthName(r.month),
    total: r.total / 100,
    ...Object.fromEntries(series.map((sv) => [sv.id, (r.byService[sv.id] ?? 0) / 100])),
  }));
  const format: Record<string, string> = {};
  for (const r of s.series) {
    format[`${r.month}:total`] = money(r.total);
    for (const sv of series) format[`${r.month}:${sv.id}`] = money(r.byService[sv.id] ?? 0);
  }

  // Next due: the most urgent unpaid bill, with the viewer's own share on it.
  const nextBill = s.overdue[0] ?? s.upcoming[0];
  const nextDetail = nextBill ? getBill(nextBill.id) : null;
  const myShare = nextDetail?.shares.find((sh) => sh.memberId === me.id) ?? null;
  const projMethod = proj.services.some((p) => p.method === 'seasonal')
    ? 'seasonal'
    : proj.services.some((p) => p.method === 'recent')
      ? 'recent'
      : proj.services.some((p) => p.method === 'single')
        ? 'single'
        : 'none';

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
                      {r.payerMemberId
                        ? ` · ${t('reminders.payTo', { name: memberNames.get(r.payerMemberId) ?? '' })}`
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

      {/* Row 1: stat tiles */}
      <div className={`grid gap-4 sm:grid-cols-2 ${shared ? 'lg:grid-cols-4' : 'lg:grid-cols-3'}`}>
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
          <>
            <Link href="/ledger" className="block text-fg">
              <Stat
                className="h-full transition hover:bg-surface-2"
                label={t('tiles.yourShare')}
                value={money(ledger.owed)}
                tone={ledger.owed > 0 ? 'warning' : 'success'}
                hint={
                  ledger.owed > 0
                    ? t('tiles.unpaidShares', { count: ledger.unpaid.length })
                    : t('tiles.allSettled')
                }
              />
            </Link>
            <Stat
              label={t('tiles.owedToYouTile')}
              value={money(ledger.owedToMe)}
              hint={
                ledger.owedToMeBy.length
                  ? ledger.owedToMeBy.map((x) => `${x.member.name} ${money(x.minor)}`).join(' · ')
                  : t('tiles.nobodyOwes')
              }
            />
          </>
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

      {/* Row 2: chart · next due · bills */}
      <div className="mt-4 grid gap-4 lg:grid-cols-[1.55fr_1fr_1fr]">
        <Card className="flex flex-col gap-3">
          <div>
            <h2 className="font-display font-semibold">{t('chart.title')}</h2>
            <p className="text-xs text-fg-muted">{t('chart.hint')}</p>
          </div>
          <MonthlyBars rows={rows} series={series} format={format} />
          <Legend items={series} />
        </Card>

        <Card className="flex flex-col gap-2">
          <h2 className="font-display font-semibold">{t('nextDue.title')}</h2>
          {nextBill && nextDetail ? (
            <>
              <Link
                href={`/bills/${nextBill.id}`}
                className="font-display text-[22px] leading-tight font-semibold text-accent"
              >
                {nextBill.service.name} · {nextBill.service.provider}
              </Link>
              <p className="text-sm text-fg-muted">
                {nextBill.daysUntilDue < 0 ? (
                  <span className="text-danger">
                    {t('billsTile.overdue', { days: -nextBill.daysUntilDue })}
                  </span>
                ) : (
                  t('billsTile.due', { date: date(nextBill.dueDate, 'short') })
                )}
                {' · '}
                {money(nextBill.amountMinor, nextBill.currency)}
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
        </Card>

        <Card className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h2 className="font-display font-semibold">{t('billsTile.title')}</h2>
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
              <span className="flex min-w-0 flex-col">
                <span className="truncate text-sm font-semibold">
                  {b.service.name} {money(b.amountMinor, b.currency)}
                </span>
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
            </Link>
          ))}
          {s.upcoming.length + s.overdue.length === 0 && (
            <p className="text-sm text-fg-muted">{t('upcoming.empty')}</p>
          )}
        </Card>
      </div>

      {/* Row 3: who owes what · settled · set aside */}
      <div className="mt-4 grid gap-4 lg:grid-cols-[1.55fr_1fr_1fr]">
        {shared ? (
          <Card className="flex flex-col gap-3">
            <h2 className="font-display font-semibold">{t('balances.title')}</h2>
            {balances.map((b) => {
              const overdue =
                b.owed > 0 &&
                mine.length >= 0 &&
                remindersFor(b.member.id, today).some((r) => r.level === 'overdue');
              return (
                <div key={b.member.id} className="flex items-center gap-3 text-sm">
                  <span className="size-8 rounded-full" style={swatch(b.member.colour)} />
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
          </Card>
        ) : (
          <Card>
            <h2 className="font-display font-semibold">{t('anomaly.title')}</h2>
            <AnomalyList items={s.anomalies} money={money} empty={t('anomaly.empty')} />
          </Card>
        )}

        {shared ? (
          <Card className="flex flex-col items-center gap-1">
            <h2 className="self-start font-display font-semibold">{t('settled.title')}</h2>
            <Gauge pct={settled?.pct ?? 0} />
            <span className="-mt-8 font-display text-[30px] font-semibold tabular-nums">
              {settled?.pct === null || settled === null ? '—' : `${settled.pct}%`}
            </span>
            <span className="text-xs text-fg-muted">
              {settled && settled.total > 0
                ? `${t('settled.count', { paid: settled.paid, total: settled.total })} · ${t('settled.hint', { month: thisMonthName })}`
                : t('settled.none')}
            </span>
          </Card>
        ) : (
          <Card>
            <h2 className="font-display font-semibold">
              {t('ranking.title', { label: s.fiscalYear.label })}
            </h2>
            <Ranking rows={s.fiscalYear.byService} money={money} empty={t('ranking.empty')} />
          </Card>
        )}

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
              {t('setAside.household', { amount: money(proj.totalMinor) })} ·{' '}
              {t(`setAside.method.${projMethod}`)}
            </>
          }
        />
      </div>

      {/* Row 4: ranking + anomalies (shared households) */}
      {shared && (
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <Card>
            <h2 className="font-display font-semibold">
              {t('ranking.title', { label: s.fiscalYear.label })}
            </h2>
            <Ranking rows={s.fiscalYear.byService} money={money} empty={t('ranking.empty')} />
          </Card>
          <Card>
            <h2 className="font-display font-semibold">{t('anomaly.title')}</h2>
            <AnomalyList items={s.anomalies} money={money} empty={t('anomaly.empty')} />
          </Card>
        </div>
      )}
    </>
  );
}

function Gauge({ pct }: { pct: number }) {
  // Semicircle from 180° to 0°; arc length proportional to pct.
  const r = 75;
  const cx = 90;
  const cy = 95;
  const angle = Math.PI * (1 - Math.max(0, Math.min(100, pct)) / 100);
  const x = cx + r * Math.cos(angle);
  const y = cy - r * Math.sin(angle);
  const large = pct > 50 ? 1 : 0;
  return (
    <svg width="180" height="100" viewBox="0 0 180 100" aria-hidden="true">
      <path
        d={`M${cx - r} ${cy} A${r} ${r} 0 0 1 ${cx + r} ${cy}`}
        fill="none"
        stroke="var(--color-surface-2)"
        strokeWidth="16"
        strokeLinecap="round"
      />
      {pct > 0 && (
        <path
          d={`M${cx - r} ${cy} A${r} ${r} 0 ${large} 1 ${x.toFixed(1)} ${y.toFixed(1)}`}
          fill="none"
          stroke="var(--color-accent)"
          strokeWidth="16"
          strokeLinecap="round"
        />
      )}
    </svg>
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
          <div className="mt-1 h-1.5 rounded-full bg-surface-2">
            <div
              className="h-1.5 rounded-full"
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
