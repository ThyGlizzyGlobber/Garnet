import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { Icon } from '@/components/app/icons';
import { TrendLine } from '@/components/charts/trend-line';
import { Badge, LinkButton } from '@/components/ui';
import { Arc, Ring } from '@/components/ui/ring';
import type { PageContext } from '@/lib/context';
import { darkVariant } from '@/lib/palette';
import { personalSummary } from '@/lib/personal';

const swatch = (c: string) => ({ background: `light-dark(${c}, ${darkVariant(c)})` });
const tile = 'glass lift rounded-card p-5 sm:p-6';

/**
 * The personal dashboard ("Mine"): what this member pays, all in — their share
 * of the household's bills and their own personal bills, kept apart — and
 * their personal bills and services, which nobody else sees.
 */
export async function PersonalView({ ctx, toggle }: { ctx: PageContext; toggle: React.ReactNode }) {
  const { hh, me, money, date, today } = ctx;
  const t = await getTranslations('personal');
  const p = personalSummary(hh.id, me.id, today, hh.fiscalYearStartMonth);
  const monthName = (m: string, style: 'short' | 'long' = 'short') =>
    new Intl.DateTimeFormat(hh.locale, { month: style, timeZone: 'UTC' }).format(
      new Date(`${m}-01T00:00:00Z`),
    );
  const thisMonthName = monthName(p.month, 'long');
  const delta =
    p.lastMonth.total > 0 ? (p.thisMonth.total - p.lastMonth.total) / p.lastMonth.total : null;
  const pct = (x: number) =>
    new Intl.NumberFormat(hh.locale, {
      style: 'percent',
      maximumFractionDigits: 0,
      signDisplay: 'exceptZero',
    }).format(x);
  const personalPct = p.thisMonth.total
    ? Math.round((p.thisMonth.personal / p.thisMonth.total) * 100)
    : 0;
  const paidPct = p.sharesThisFy ? Math.round((p.sharesPaidThisFy / p.sharesThisFy) * 100) : 100;
  const points = p.series.map((r) => ({
    key: r.month,
    label: monthName(r.month),
    value: r.total / 100,
    text: money(r.total),
    detail: t('chart.detail', { shares: money(r.shares), personal: money(r.personal) }),
  }));
  const hasPersonal = p.personalServices.length > 0;

  return (
    <>
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <h1 className="font-display text-[32px] leading-[1.06] font-semibold tracking-tight sm:text-[42px]">
          {t('greeting', { name: me.name })}
          <br />
          <span className="font-normal text-fg-muted">
            {t('line', { month: thisMonthName, amount: money(p.thisMonth.total) })}
          </span>
        </h1>
        {toggle}
      </header>

      {/* Row 1: this month · what I owe · this year */}
      <div className="grid gap-4 lg:grid-cols-[1.3fr_1fr_1fr]">
        <section className={`${tile} flex items-center gap-6 bg-accent-soft`}>
          <Ring id="mine-split" pct={100 - personalPct} size={132} stroke={13}>
            <span className="flex flex-col items-center leading-none">
              <span className="font-display text-[26px] font-semibold tabular-nums">
                {100 - personalPct}%
              </span>
              <span className="mt-1 text-[10px] font-semibold tracking-wide text-fg-muted uppercase">
                {t('month.householdShort')}
              </span>
            </span>
          </Ring>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">{t('month.title', { month: thisMonthName })}</p>
            <p className="font-display text-[38px] leading-none font-semibold tracking-tight tabular-nums sm:text-[44px]">
              {money(p.thisMonth.total)}
            </p>
            <p className="mt-2 flex flex-wrap items-center gap-2 text-xs text-fg-muted">
              <span className="rounded-full bg-surface-2 px-2 py-0.5 font-bold text-fg">
                {delta !== null ? pct(delta) : '—'}
              </span>
              {delta !== null ? t('month.vsLast') : t('month.noLast')}
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
        </section>

        {/* Shares only exist in a household that splits its bills. */}
        {hh.splitMode === 'shared' && (
          <Link href="/ledger" className={`${tile} flex flex-col text-fg`}>
            <div className="flex items-start justify-between">
              <p className="text-sm font-semibold">{t('owe.title')}</p>
              <Badge tone={p.owed > 0 ? 'warning' : 'success'}>
                {p.owed > 0 ? t('owe.toPay') : t('owe.settled')}
              </Badge>
            </div>
            <div className="mt-2 flex flex-col items-center">
              <Arc
                id="mine-owe"
                pct={paidPct}
                width={190}
                stroke={13}
                from="var(--color-accent-2)"
                to="var(--color-accent)"
              />
              <span className="-mt-9 flex flex-col items-center leading-none">
                <span
                  className={`font-display text-[32px] font-semibold tabular-nums ${p.owed > 0 ? 'text-warning' : 'text-success'}`}
                >
                  {money(p.owed)}
                </span>
                <span className="mt-1 text-[11px] text-fg-muted">
                  {t('owe.owedToYou', { amount: money(p.owedToMe) })}
                </span>
              </span>
            </div>
            <p className="mt-3 text-center text-xs text-fg-muted">
              {t('owe.paidOfYear', { pct: paidPct, label: p.fiscalYear.label })}
            </p>
          </Link>
        )}

        <section className={`${tile} flex flex-col justify-between gap-3`}>
          <p className="text-sm font-semibold">{t('year.title', { label: p.fiscalYear.label })}</p>
          <p className="font-display text-[40px] leading-none font-semibold tracking-tight tabular-nums">
            {money(p.fiscalYear.total)}
          </p>
          <div>
            <div className="flex h-2.5 overflow-hidden rounded-full bg-surface-2">
              <div
                className="h-full bg-accent"
                style={{
                  width: `${p.fiscalYear.total ? (p.fiscalYear.shares / p.fiscalYear.total) * 100 : 0}%`,
                }}
              />
              <div
                className="h-full bg-accent-2"
                style={{
                  width: `${p.fiscalYear.total ? (p.fiscalYear.personal / p.fiscalYear.total) * 100 : 0}%`,
                }}
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
        </section>
      </div>

      {/* Row 2: my spending over time · my bills */}
      <div className="mt-4 grid gap-4 lg:grid-cols-[1.6fr_1fr]">
        <section className={`${tile} flex flex-col gap-3`}>
          <div>
            <h2 className="font-display text-lg font-semibold">{t('chart.title')}</h2>
            <p className="text-xs text-fg-muted">{t('chart.hint')}</p>
          </div>
          <TrendLine points={points} id="mine" label={t('chart.title')} />
        </section>

        <section className={`${tile} flex flex-col gap-3`}>
          <div className="flex items-center justify-between">
            <h2 className="font-display text-lg font-semibold">{t('bills.title')}</h2>
            <Badge>{t('onlyYou')}</Badge>
          </div>
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
            p.upcoming.slice(0, 5).map((b) => (
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
                    className={`truncate text-xs ${b.daysUntilDue < 0 ? 'text-danger' : 'text-fg-muted'}`}
                  >
                    {b.daysUntilDue < 0
                      ? t('bills.overdue', { days: -b.daysUntilDue })
                      : t('bills.due', { date: date(b.dueDate, 'short') })}
                  </span>
                </span>
                <span className="text-sm font-semibold tabular-nums">
                  {money(b.dueMinor, b.currency)}
                </span>
              </Link>
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
        </section>
      </div>

      {/* Row 3: where my money goes · my services */}
      <div className="mt-4 grid gap-4 lg:grid-cols-[1.6fr_1fr]">
        <section className={tile}>
          <h2 className="font-display text-lg font-semibold">
            {t('ranking.title', { label: p.fiscalYear.label })}
          </h2>
          {p.byService.length === 0 ? (
            <p className="mt-3 text-sm text-fg-muted">{t('ranking.empty')}</p>
          ) : (
            <ul className="mt-3 flex flex-col gap-3">
              {p.byService.map((row) => (
                <li key={row.service.id}>
                  <div className="flex items-center justify-between gap-2 text-sm">
                    <span className="flex min-w-0 items-center gap-2">
                      <span
                        className="size-2.5 shrink-0 rounded-sm"
                        style={swatch(row.service.colour)}
                      />
                      <span className="truncate">{row.service.name}</span>
                      <span className="shrink-0 text-xs text-fg-muted">
                        {row.personal ? t('ranking.personal') : t('ranking.share')}
                      </span>
                    </span>
                    <span className="font-semibold tabular-nums">{money(row.minor)}</span>
                  </div>
                  <div className="mt-1 h-2 rounded-full bg-surface-2">
                    <div
                      className="h-2 rounded-full"
                      style={{
                        width: `${Math.max(4, Math.round((row.minor / p.byService[0]!.minor) * 100))}%`,
                        ...swatch(row.service.colour),
                      }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className={`${tile} flex flex-col gap-3`}>
          <div className="flex items-center justify-between">
            <h2 className="font-display text-lg font-semibold">{t('services.title')}</h2>
            <Link href="/services/new?personal=1" className="text-sm font-semibold text-accent">
              {t('services.add')}
            </Link>
          </div>
          {hasPersonal ? (
            p.personalServices.map((s) => (
              <Link key={s.id} href={`/services/${s.id}`} className="flex items-center gap-3">
                <span
                  className="grid size-9 shrink-0 place-items-center rounded-xl text-white"
                  style={swatch(s.colour)}
                >
                  <Icon name={s.type.icon} width={16} height={16} />
                </span>
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
        </section>
      </div>
    </>
  );
}
