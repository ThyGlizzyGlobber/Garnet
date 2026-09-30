import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { ChangeText } from '@/components/app/usage';
import { TrendLine } from '@/components/charts/trend-line';
import { Badge, Figure, LinkButton, Tile, TileHeader } from '@/components/ui';
import { Avatar, IconDisc, Swatch } from '@/components/ui/colour';
import { InlineAction } from '@/components/ui/form';
import { Arc, Ring } from '@/components/ui/ring';
import type { PageContext } from '@/lib/context';
import { toMajor } from '@/lib/format';
import type { HomeView } from '@/lib/home';
import { unitLabel } from '@/lib/units';
import { toggleSharePaidAction } from '../bills/actions';
import { BillRow, RankingList } from './parts';

/**
 * The household dashboard's tiles. Each takes the Home view (src/lib/home.ts)
 * and the page's formatters; none works anything out for itself.
 */
type Props = { v: HomeView; ctx: PageContext };

/** This month so far, against the month's estimate (the budget ring). */
export async function MonthTile({ v, ctx }: Props) {
  const t = await getTranslations('dashboard');
  const { money, month, pct } = ctx;
  const name = month(v.month.month);
  return (
    <Tile tone="accent" className="flex flex-wrap items-center gap-6">
      <Ring id="budget" pct={v.month.budgetPct} size={132} stroke={13}>
        <span className="flex flex-col items-center leading-none">
          <Figure size="xs">{v.month.budgetPct}%</Figure>
          <span className="mt-1 text-[11px] font-semibold tracking-wide text-fg-muted uppercase">
            {month(v.month.month, 'short')}
          </span>
        </span>
      </Ring>
      <div className="min-w-44 flex-1">
        <p className="text-sm font-semibold">{t('tiles.thisMonth', { month: name })}</p>
        <Figure size="xl">{money(v.month.totalMinor)}</Figure>
        <p className="mt-2 flex flex-wrap items-center gap-2 text-xs text-fg-muted">
          <span className="rounded-full bg-surface-2 px-2 py-0.5 font-bold text-fg">
            {v.month.vsLastMonth !== null ? pct(v.month.vsLastMonth, { signed: true }) : '—'}
          </span>
          {v.month.vsLastMonth !== null ? t('tiles.vsLastMonth') : t('tiles.noLastMonth')}
          {v.month.vsLastYear !== null &&
            ` · ${t('tiles.vsLastYear', { pct: pct(v.month.vsLastYear, { signed: true }) })}`}
        </p>
        <p className="mt-1 text-xs text-fg-muted">
          {v.month.budgetPct > 100 ? t('budgetRing.over') : t('budgetRing.label', { month: name })}{' '}
          · {money(v.month.projectedMinor)}
        </p>
      </div>
    </Tile>
  );
}

/** What the viewer still owes for their shares, and how much of the year's they've paid. */
export async function ShareTile({ v, ctx }: Props) {
  const t = await getTranslations('dashboard');
  const { money } = ctx;
  const share = v.share!;
  return (
    <Tile href="/money" className="flex flex-col">
      <TileHeader
        small
        title={t('tiles.yourShare')}
        action={
          <Badge tone={share.owed > 0 ? 'warning' : 'success'}>
            {share.owed > 0
              ? t('tiles.unpaidShares', { count: share.unpaidCount })
              : t('tiles.allSettled')}
          </Badge>
        }
      />
      <div className="mt-2 flex flex-col items-center">
        <Arc
          id="share"
          pct={share.paidPct}
          width={190}
          stroke={13}
          from="var(--color-accent-2)"
          to="var(--color-accent)"
        />
        <span className="-mt-9 flex flex-col items-center leading-none">
          <Figure size="sm" tone={share.owed > 0 ? 'warning' : 'success'}>
            {money(share.owed)}
          </Figure>
          <span className="mt-1 text-[11px] text-fg-muted">
            {t('tiles.owedToYou', { amount: money(share.owedToMe) })}
          </span>
        </span>
      </div>
      <p className="mt-3 text-center text-xs text-fg-muted">
        {t('tiles.paidOfYear', { pct: share.paidPct, label: v.summary.fiscalYear.label })}
      </p>
    </Tile>
  );
}

/** Households that don't split bills: this month's cost per person per day. */
export async function PerPersonTile({ v, ctx }: Props) {
  const t = await getTranslations('dashboard');
  return (
    <Tile className="flex flex-col justify-between">
      <p className="text-sm font-semibold">{t('tiles.perPersonDay')}</p>
      <Figure>{v.perPersonPerDay !== null ? ctx.money(v.perPersonPerDay) : '—'}</Figure>
      <p className="text-xs text-fg-muted">
        {t('tiles.perPersonDayHint', { count: v.summary.activeMemberCount })}
      </p>
    </Tile>
  );
}

/** The next six months' estimates, and what to set aside for next month. */
export async function ForecastTile({ v, ctx }: Props) {
  const t = await getTranslations('dashboard');
  const { money, month } = ctx;
  const max = Math.max(...v.forecast.months.map((f) => f.totalMinor), 1);
  return (
    <Tile className="flex flex-col">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-semibold">{t('forecast.title')}</p>
        <span className="text-right text-xs text-fg-muted">{t('forecast.hint')}</span>
      </div>
      <div className="mt-4 flex flex-1 items-end justify-between gap-2">
        {v.forecast.months.map((f, i) => (
          <div key={f.month} className="flex flex-1 flex-col items-center gap-1.5">
            <span className="text-[11px] font-semibold tabular-nums">
              {money(f.totalMinor, undefined, { whole: true })}
            </span>
            <div
              className={`w-full max-w-9 rounded-full ${i === 0 ? 'bg-accent' : 'hatch'}`}
              style={{ height: `${Math.max(10, Math.round((f.totalMinor / max) * 90))}px` }}
            />
            <span className="text-[11px] text-fg-muted">{month(f.month, 'short')}</span>
          </div>
        ))}
      </div>
      <p className="mt-3 text-xs text-fg-muted">
        {t('setAside.title', { month: month(v.forecast.nextMonth) })}:{' '}
        <span className="font-semibold text-fg">
          {v.forecast.setAsideEach !== null
            ? `${money(v.forecast.setAsideEach)} ${t('setAside.each')}`
            : money(v.forecast.setAsideTotal)}
        </span>{' '}
        · {t(`setAside.method.${v.forecast.method}`)}
      </p>
    </Tile>
  );
}

/** Twelve months of cost as one trend line; the tooltip names the biggest services. */
export async function ChartTile({ v, ctx }: Props) {
  const t = await getTranslations('dashboard');
  const { hh, money, month } = ctx;
  const points = v.chart.map((r) => ({
    key: r.month,
    label: month(r.month, 'short'),
    value: toMajor(r.totalMinor, hh.currency),
    text: money(r.totalMinor),
    detail: r.top.map((x) => `${x.name} ${money(x.minor)}`).join(' · ') || undefined,
  }));
  return (
    <Tile className="flex flex-col gap-3">
      <TileHeader
        title={t('chart.title')}
        hint={t('chart.hint')}
        action={
          <span className="rounded-full bg-surface-2 px-3 py-1 text-xs font-semibold text-fg-muted">
            {t('chart.range')}
          </span>
        }
      />
      <TrendLine points={points} id="dash" label={t('chart.title')} />
    </Tile>
  );
}

/** The next bill to pay, and the viewer's share of it with one-click "paid". */
export async function NextDueTile({ v, ctx }: Props) {
  const t = await getTranslations('dashboard');
  const { money, date } = ctx;
  const n = v.nextDue;
  return (
    <Tile tone={n?.overdue ? 'danger' : 'plain'} className="flex flex-col gap-2">
      <TileHeader
        title={t('nextDue.title')}
        action={
          n && (
            <IconDisc
              icon={n.bill.service.type.icon}
              colour={n.bill.service.colour}
              size={40}
              className="rounded-full"
            />
          )
        }
      />
      {n ? (
        <>
          <Link
            href={`/bills/${n.bill.id}`}
            className="font-display text-[24px] leading-tight font-semibold"
          >
            {n.bill.service.name}
          </Link>
          <Figure size="md">{money(n.due.amountMinor, n.bill.currency)}</Figure>
          {n.due.seq !== null && (
            <p className="text-xs text-fg-muted">
              {t('nextDue.instalment', { n: n.due.seq, of: n.due.of })}
            </p>
          )}
          <p className="text-sm text-fg-muted">
            {n.overdue ? (
              <span className="font-semibold text-danger">
                {t('billsTile.overdue', { days: -n.bill.daysUntilDue })}
              </span>
            ) : (
              t('billsTile.due', { date: date(n.bill.dueDate, 'short') })
            )}
            {n.myShare &&
              ` · ${t('nextDue.yourShare', { amount: money(n.myShare.amountMinor, n.myShare.currency) })}`}
          </p>
          <div className="mt-auto pt-3">
            {n.myShare && !n.myShare.paidAt ? (
              <InlineAction
                action={toggleSharePaidAction}
                hidden={{ shareId: n.myShare.id, billId: n.bill.id, paid: 'true' }}
                label={t('nextDue.markPaid')}
              />
            ) : n.myShare ? (
              <Badge tone="success">{t('nextDue.paid')}</Badge>
            ) : (
              <LinkButton href={`/bills/${n.bill.id}`} variant="secondary">
                {t('nextDue.viewBill')}
              </LinkButton>
            )}
          </div>
        </>
      ) : (
        <p className="text-sm text-success">{t('nextDue.none')}</p>
      )}
    </Tile>
  );
}

/** Overdue and upcoming bills, soonest first. */
export async function UpcomingTile({ v, ctx }: Props) {
  const t = await getTranslations('dashboard');
  const { money, date } = ctx;
  return (
    <Tile className="flex flex-col gap-3">
      <TileHeader
        title={t('billsTile.title')}
        action={
          <Link href="/bills" className="text-xs font-bold text-accent">
            {t('billsTile.all', { count: v.upcoming.count })}
          </Link>
        }
      />
      {v.upcoming.bills.map((b) => (
        <BillRow
          key={b.id}
          href={`/bills/${b.id}`}
          icon={b.service.type.icon}
          colour={b.service.colour}
          name={b.service.name}
          tone={b.daysUntilDue < 0 ? 'danger' : b.isAnomaly ? 'warning' : 'muted'}
          status={
            b.daysUntilDue < 0
              ? t('billsTile.overdue', { days: -b.daysUntilDue })
              : b.isAnomaly
                ? t('billsTile.unusual', { note: b.anomalyNote ?? '' })
                : t('billsTile.due', { date: date(b.dueDate, 'short') })
          }
          amount={money(b.due.amountMinor, b.currency)}
        />
      ))}
      {v.upcoming.count === 0 && <p className="text-sm text-fg-muted">{t('upcoming.empty')}</p>}
    </Tile>
  );
}

/** Who owes what: each member's unpaid shares. */
export async function BalancesTile({ v, ctx }: Props) {
  const t = await getTranslations('dashboard');
  const { me, money } = ctx;
  return (
    <Tile className="flex flex-col gap-3">
      <TileHeader title={t('balances.title')} />
      {v.balances.map((b) => (
        <div key={b.member.id} className="flex items-center gap-3 text-sm">
          <Avatar name={b.member.name} colour={b.member.colour} />
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
          <Badge tone={b.owed === 0 ? 'success' : b.overdue ? 'danger' : 'warning'}>
            {b.owed === 0
              ? t('balances.settledChip')
              : b.overdue
                ? t('balances.overdue')
                : t('balances.pending')}
          </Badge>
        </div>
      ))}
    </Tile>
  );
}

/** How many of this month's shares have been paid. */
export async function SettledTile({ v, ctx }: Props) {
  const t = await getTranslations('dashboard');
  const s = v.settled;
  return (
    <Tile className="flex flex-col items-center gap-2">
      <h2 className="self-start font-display text-lg font-semibold">{t('settled.title')}</h2>
      <Ring
        id="settled"
        pct={s?.pct ?? 0}
        size={140}
        stroke={14}
        from="var(--color-success)"
        to="var(--color-accent-2)"
      >
        <span className="font-display text-[30px] font-semibold tabular-nums">
          {s?.pct == null ? '—' : `${s.pct}%`}
        </span>
      </Ring>
      <span className="text-center text-xs text-fg-muted">
        {s && s.total > 0
          ? `${t('settled.count', { paid: s.paid, total: s.total })} · ${t('settled.hint', { month: ctx.month(v.month.month) })}`
          : t('settled.none')}
      </span>
    </Tile>
  );
}

/** What each service cost this financial year, biggest first. */
export async function RankingTile({ v, ctx }: Props) {
  const t = await getTranslations('dashboard');
  return (
    <Tile>
      <TileHeader title={t('ranking.title', { label: v.summary.fiscalYear.label })} />
      <RankingList
        empty={t('ranking.empty')}
        rows={v.ranking.map((r) => ({
          id: r.service.id,
          name: r.service.name,
          colour: r.service.colour,
          minor: r.minor,
          amount: ctx.money(r.minor),
        }))}
      />
    </Tile>
  );
}

/** Bills flagged as unusual for their service. */
export async function AnomaliesTile({ v, ctx, className }: Props & { className?: string }) {
  const t = await getTranslations('dashboard');
  return (
    <Tile className={className}>
      <TileHeader title={t('anomaly.title')} />
      {v.anomalies.length === 0 ? (
        <p className="mt-3 text-sm text-fg-muted">{t('anomaly.empty')}</p>
      ) : (
        <ul className="mt-2 divide-y divide-border text-sm">
          {v.anomalies.map((b) => (
            <li key={b.id}>
              <Link
                href={`/bills/${b.id}`}
                className="flex items-center justify-between gap-3 py-2.5"
              >
                <span>
                  <span className="block font-medium">{b.service.name}</span>
                  <span className="text-xs text-warning">{b.anomalyNote}</span>
                </span>
                <span className="font-semibold tabular-nums">
                  {ctx.money(b.amountMinor, b.currency)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Tile>
  );
}

/** Usage per day for each service with usage figures, against the previous bill and its limit. */
export async function UsageTile({ v, ctx, className }: Props & { className?: string }) {
  const tu = await getTranslations('usage');
  const { qty } = ctx;
  return (
    <Tile className={className}>
      <TileHeader title={tu('dashboard.title')} hint={tu('dashboard.hint')} />
      <ul className="mt-3 grid gap-x-8 gap-y-1 sm:grid-cols-2 lg:grid-cols-3">
        {v.usage.map((u) => (
          <li key={u.serviceId}>
            <Link
              href={`/services/${u.serviceId}`}
              className="flex items-baseline justify-between gap-3 border-b border-border py-2 text-sm hover:text-accent"
            >
              <span className="flex items-center gap-2">
                <Swatch colour={u.service.colour} />
                {u.service.name}
              </span>
              <span className="text-right">
                <span className="font-semibold tabular-nums">
                  {tu('perDay', { qty: qty(u.perDay), unit: unitLabel(u.unit) })}
                </span>
                <ChangeText
                  className="block text-xs"
                  change={u.previous?.usage}
                  words={(p) => ({
                    more: tu('more', { pct: p }),
                    less: tu('less', { pct: p }),
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
        ))}
      </ul>
    </Tile>
  );
}

/** A household-wide note for an admin, with its actions (area comparisons, postcode). */
export function NoticeCard({
  title,
  body,
  children,
  className,
}: {
  title: string;
  body: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Tile className={`flex flex-col gap-2 ${className ?? ''}`}>
      <h2 className="font-display text-lg font-semibold">{title}</h2>
      <p className="text-sm text-fg-muted">{body}</p>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </Tile>
  );
}
