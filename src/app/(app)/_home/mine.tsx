import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { TrendLine } from '@/components/charts/trend-line';
import { Badge, Figure, LinkButton, Tile, TileHeader } from '@/components/ui';
import { IconDisc } from '@/components/ui/colour';
import { Arc, Ring } from '@/components/ui/ring';
import type { PageContext } from '@/lib/context';
import { toMajor } from '@/lib/format';
import { personalSummary } from '@/lib/personal';
import { BillRow, Greeting, RankingList } from './parts';

/**
 * The personal dashboard ("Mine"): what this member pays, all in — their share
 * of the household's bills and their own personal bills, kept apart — and
 * their personal bills and services, which nobody else sees. Numbers come from
 * personalSummary() (src/lib/personal.ts).
 */
export async function PersonalView({ ctx, toggle }: { ctx: PageContext; toggle: React.ReactNode }) {
  const { hh, me, money, date, month, pct, today } = ctx;
  const t = await getTranslations('personal');
  const p = personalSummary(hh.id, me.id, today, hh.fiscalYearStartMonth);
  const thisMonth = month(p.month);
  const points = p.series.map((r) => ({
    key: r.month,
    label: month(r.month, 'short'),
    value: toMajor(r.total, hh.currency),
    text: money(r.total),
    detail: t('chart.detail', { shares: money(r.shares), personal: money(r.personal) }),
  }));
  const hasPersonal = p.personalServices.length > 0;
  const fyPct = (part: number) => (p.fiscalYear.total ? (part / p.fiscalYear.total) * 100 : 0);

  return (
    <>
      <Greeting
        hello={t('greeting', { name: me.name })}
        line={t('line', { month: thisMonth, amount: money(p.thisMonth.total) })}
      >
        {toggle}
      </Greeting>

      {/* Row 1: this month · what I owe · this year */}
      <div className="grid gap-4 lg:grid-cols-[1.3fr_1fr_1fr]">
        <Tile tone="accent" className="flex flex-wrap items-center gap-6">
          <Ring id="mine-split" pct={p.householdPct} size={132} stroke={13}>
            <span className="flex flex-col items-center leading-none">
              <Figure size="xs">{p.householdPct}%</Figure>
              <span className="mt-1 text-[11px] font-semibold tracking-wide text-fg-muted uppercase">
                {t('month.householdShort')}
              </span>
            </span>
          </Ring>
          <div className="min-w-44 flex-1">
            <p className="text-sm font-semibold">{t('month.title', { month: thisMonth })}</p>
            <Figure size="xl">{money(p.thisMonth.total)}</Figure>
            <p className="mt-2 flex flex-wrap items-center gap-2 text-xs text-fg-muted">
              <span className="rounded-full bg-surface-2 px-2 py-0.5 font-bold text-fg">
                {p.vsLastMonth !== null ? pct(p.vsLastMonth, { signed: true }) : '—'}
              </span>
              {p.vsLastMonth !== null ? t('month.vsLast') : t('month.noLast')}
            </p>
            <dl className="mt-2 grid grid-cols-2 gap-2 text-xs">
              <div>
                <dt className="text-fg-muted">{t('month.shares')}</dt>
                <dd className="font-semibold tabular-nums">{money(p.thisMonth.shares)}</dd>
              </div>
              <div>
                <dt className="text-fg-muted">{t('month.personal')}</dt>
                <dd className="font-semibold tabular-nums">{money(p.thisMonth.personal)}</dd>
              </div>
            </dl>
          </div>
        </Tile>

        {/* Shares only exist in a household that splits its bills. */}
        {hh.splitMode === 'shared' && (
          <Tile href="/ledger" className="flex flex-col">
            <TileHeader
              small
              title={t('owe.title')}
              action={
                <Badge tone={p.owed > 0 ? 'warning' : 'success'}>
                  {p.owed > 0 ? t('owe.toPay') : t('owe.settled')}
                </Badge>
              }
            />
            <div className="mt-2 flex flex-col items-center">
              <Arc
                id="mine-owe"
                pct={p.paidPct}
                width={190}
                stroke={13}
                from="var(--color-accent-2)"
                to="var(--color-accent)"
              />
              <span className="-mt-9 flex flex-col items-center leading-none">
                <Figure size="sm" tone={p.owed > 0 ? 'warning' : 'success'}>
                  {money(p.owed)}
                </Figure>
                <span className="mt-1 text-[11px] text-fg-muted">
                  {t('owe.owedToYou', { amount: money(p.owedToMe) })}
                </span>
              </span>
            </div>
            <p className="mt-3 text-center text-xs text-fg-muted">
              {t('owe.paidOfYear', { pct: p.paidPct, label: p.fiscalYear.label })}
            </p>
          </Tile>
        )}

        <Tile className="flex flex-col justify-between gap-3">
          <p className="text-sm font-semibold">{t('year.title', { label: p.fiscalYear.label })}</p>
          <Figure>{money(p.fiscalYear.total)}</Figure>
          <div>
            <div className="flex h-2.5 overflow-hidden rounded-full bg-surface-2">
              <div
                className="h-full bg-accent"
                style={{ width: `${fyPct(p.fiscalYear.shares)}%` }}
              />
              <div
                className="h-full bg-accent-2"
                style={{ width: `${fyPct(p.fiscalYear.personal)}%` }}
              />
            </div>
            <p className="mt-2 flex flex-wrap justify-between gap-2 text-xs text-fg-muted">
              <span className="flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-accent" />
                {t('year.shares', { amount: money(p.fiscalYear.shares) })}
              </span>
              <span className="flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-accent-2" />
                {t('year.personal', { amount: money(p.fiscalYear.personal) })}
              </span>
            </p>
          </div>
        </Tile>
      </div>

      {/* Row 2: my spending over time · my bills */}
      <div className="mt-4 grid gap-4 lg:grid-cols-[1.6fr_1fr]">
        <Tile className="flex flex-col gap-3">
          <TileHeader title={t('chart.title')} hint={t('chart.hint')} />
          <TrendLine points={points} id="mine" label={t('chart.title')} />
        </Tile>

        <Tile className="flex flex-col gap-3">
          <TileHeader title={t('bills.title')} action={<Badge>{t('onlyYou')}</Badge>} />
          {!hasPersonal ? (
            <>
              <p className="text-sm text-fg-muted">{t('bills.intro')}</p>
              <div className="mt-auto">
                <LinkButton href="/services/new?personal=1">{t('bills.addService')}</LinkButton>
              </div>
            </>
          ) : p.upcoming.length === 0 ? (
            <p className="text-sm text-success">{t('bills.none')}</p>
          ) : (
            p.upcoming
              .slice(0, 5)
              .map((b) => (
                <BillRow
                  key={b.id}
                  href={`/bills/${b.id}`}
                  icon={b.service.type.icon}
                  colour={b.service.colour}
                  name={b.service.name}
                  tone={b.daysUntilDue < 0 ? 'danger' : 'muted'}
                  status={
                    b.daysUntilDue < 0
                      ? t('bills.overdue', { days: -b.daysUntilDue })
                      : t('bills.due', { date: date(b.dueDate, 'short') })
                  }
                  amount={money(b.dueMinor, b.currency)}
                />
              ))
          )}
          {hasPersonal && (
            <div className="mt-auto flex flex-wrap gap-2 pt-2">
              <LinkButton href="/bills/new?personal=1" variant="secondary">
                {t('bills.add')}
              </LinkButton>
              <LinkButton href="/bills/upload" variant="secondary">
                {t('bills.upload')}
              </LinkButton>
            </div>
          )}
        </Tile>
      </div>

      {/* Row 3: where my money goes · my services */}
      <div className="mt-4 grid gap-4 lg:grid-cols-[1.6fr_1fr]">
        <Tile>
          <TileHeader title={t('ranking.title', { label: p.fiscalYear.label })} />
          <RankingList
            empty={t('ranking.empty')}
            rows={p.byService.map((r) => ({
              id: r.service.id,
              name: r.service.name,
              colour: r.service.colour,
              minor: r.minor,
              amount: money(r.minor),
              note: r.personal ? t('ranking.personal') : t('ranking.share'),
            }))}
          />
        </Tile>

        <Tile className="flex flex-col gap-3">
          <TileHeader
            title={t('services.title')}
            action={
              <Link href="/services/new?personal=1" className="text-sm font-semibold text-accent">
                {t('services.add')}
              </Link>
            }
          />
          {hasPersonal ? (
            p.personalServices.map((s) => (
              <Link key={s.id} href={`/services/${s.id}`} className="flex items-center gap-3">
                <IconDisc icon={s.type.icon} colour={s.colour} />
                <span className="flex min-w-0 flex-col">
                  <span className="truncate text-sm font-semibold">{s.name}</span>
                  <span className="truncate text-xs text-fg-muted">
                    {s.provider} · {s.type.label}
                  </span>
                </span>
              </Link>
            ))
          ) : (
            <p className="text-sm text-fg-muted">{t('services.none')}</p>
          )}
        </Tile>
      </div>
    </>
  );
}
