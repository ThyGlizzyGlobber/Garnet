import type { ReactNode } from 'react';
import { getTranslations } from 'next-intl/server';
import { lowerFirst, rowCtx, statusLabel } from '@/components/app/bill-rows';
import { MonthBars } from '@/components/charts/month-bars';
import { StackBar } from '@/components/charts/stack-bar';
import { YearAhead } from '@/components/charts/year-ahead';
import { Card } from '@/components/ui';
import { SectionHead } from '@/components/ui/blocks';
import { Swatch } from '@/components/ui/colour';
import type { PageContext } from '@/lib/context';
import type { MainOverview } from '@/lib/main-overview';

/**
 * The pieces of a main service's overview (numbers from mainOverview()):
 * the year ahead, what was due each month, the four figures and where the
 * money goes. OverviewLayout puts them beside a page's cards like a
 * service's own page; Vehicles and a vehicle's page use them one by one.
 */

/** A series' name as the page words it ("Rego" for Vehicle registration). */
type SeriesName = (key: string, label: string) => string;

function seriesOf(o: MainOverview, seriesName: SeriesName) {
  const byKey = new Map(o.series.map((s) => [s.key, s]));
  return {
    name: (key: string) => {
      const s = byKey.get(key);
      return s ? seriesName(s.key, s.label) : '';
    },
    colour: (key: string) => byKey.get(key)?.colour ?? '#2a78d6',
  };
}

/** The next twelve months: a row each (vehicles, services or kinds), a mark where something's due. */
export async function YearAheadCard({
  ctx,
  overview: o,
  seriesName,
  rowName = (_, label) => label,
}: {
  ctx: PageContext;
  overview: MainOverview;
  seriesName: SeriesName;
  /** A row's name (a kind's row reads "Rego"). */
  rowName?: SeriesName;
}) {
  const { hh, money, month, today } = ctx;
  const t = await getTranslations('main.overview');
  const rc = rowCtx(ctx, await getTranslations('ui'));
  const { name, colour } = seriesOf(o, seriesName);
  const any = o.ahead.rows.some((r) => r.items.length > 0);
  const short = (minor: number) =>
    money(minor, hh.currency, minor >= 100_000 ? { compact: true } : { whole: true });
  return (
    <Card>
      <SectionHead title={t('ahead')} right={<span className="muted">{t('aheadHint')}</span>} />
      {any ? (
        <YearAhead
          label={t('ahead')}
          months={o.ahead.months.map((m) => month(m, 'short'))}
          rows={o.ahead.rows.map((r) => ({
            key: r.key,
            label: rowName(r.key, r.label),
            items: r.items.map((i, n) => ({
              key: `${i.billId ?? 'x'}-${n}`,
              col: o.ahead.months.indexOf(i.month),
              // Outlined marks are expected ones: no "~" needed. Short enough
              // for a month's cell: "$912", "$1.2K".
              amount: i.amountMinor === null ? '?' : short(i.amountMinor),
              colour: colour(i.seriesKey),
              tip: `${name(i.seriesKey)} · ${rowName(r.key, r.label)} · ${
                i.expected
                  ? t('expectedOn', { date: rc.dateYear(i.dueDate) })
                  : t('dueOn', { date: rc.dateYear(i.dueDate) })
              }${i.amountMinor === null ? '' : ` · ${money(i.amountMinor)}`}`,
              href: i.billId ? `/bills/${i.billId}` : undefined,
              expected: i.expected,
              late: !i.expected && i.dueDate < today,
            })),
          }))}
        />
      ) : (
        <p className="muted small">{t('aheadNone')}</p>
      )}
    </Card>
  );
}

/** What was due each of the last twelve months, stacked by series. */
export async function MonthsCard({
  ctx,
  overview: o,
  seriesName,
}: {
  ctx: PageContext;
  overview: MainOverview;
  seriesName: SeriesName;
}) {
  const { money, month } = ctx;
  const t = await getTranslations('main.overview');
  const { name, colour } = seriesOf(o, seriesName);
  return (
    <Card>
      <SectionHead title={t('byMonth')} right={<span className="muted">{t('byMonthHint')}</span>} />
      {o.yearMinor > 0 ? (
        <>
          <MonthBars
            label={t('byMonth')}
            bars={o.months.map((m) => ({
              label: month(m.month, 'short'),
              parts: m.parts.map((p) => ({
                value: p.minor,
                colour: colour(p.key),
                tip: `${month(m.month, 'long-year')} · ${name(p.key)} · ${money(p.minor)}`,
              })),
            }))}
          />
          {o.bySeries.length > 1 && (
            <div className="ov-legend">
              {o.bySeries.map((s) => (
                <span key={s.key}>
                  <Swatch colour={s.colour} />
                  {seriesName(s.key, s.label)}
                </span>
              ))}
            </div>
          )}
        </>
      ) : (
        <p className="muted small">{t('byMonthNone')}</p>
      )}
    </Card>
  );
}

/** The four figures: last 12 months, a month on average, next due, and a fourth of the page's own. */
export async function NumsCard({
  ctx,
  overview: o,
  seriesName,
  fourth,
  className,
}: {
  ctx: PageContext;
  overview: MainOverview;
  seriesName: SeriesName;
  fourth: { label: string; value: string; sub: string };
  className?: string;
}) {
  const { hh, money } = ctx;
  const t = await getTranslations('main.overview');
  const rc = rowCtx(ctx, await getTranslations('ui'));
  const { name } = seriesOf(o, seriesName);
  const whole = (minor: number) => money(minor, hh.currency, { whole: true });
  const next = o.next;
  return (
    <Card className={`d3-nums${className ? ` ${className}` : ''}`}>
      <div>
        <span className="muted small">{t('year')}</span>
        <b>{whole(o.yearMinor)}</b>
        <span className="muted small">{t('bills', { count: o.yearBills })}</span>
      </div>
      <div>
        <span className="muted small">{t('month')}</span>
        <b>{whole(o.perMonthMinor)}</b>
        <span className="muted small">{t('monthSub')}</span>
      </div>
      <div>
        <span className="muted small">{t('next')}</span>
        <b>
          {next && next.amountMinor !== null
            ? next.status
              ? money(next.amountMinor)
              : `≈ ${whole(next.amountMinor)}`
            : '—'}
        </b>
        <span className="muted small">
          {next
            ? `${next.rowLabel && next.rowLabel !== name(next.seriesKey) ? `${next.rowLabel} · ` : ''}${name(next.seriesKey)} · ${
                next.status
                  ? lowerFirst(statusLabel(rc, next.status))
                  : t('expectedOn', { date: rc.date(next.dueDate) })
              }`
            : t('nothingNext')}
        </span>
      </div>
      <div>
        <span className="muted small">{fourth.label}</span>
        <b>{fourth.value}</b>
        <span className="muted small">{fourth.sub}</span>
      </div>
    </Card>
  );
}

/** Where the money went over the last twelve months: a bar and a line per series (or per row). */
export async function BreakdownCard({
  ctx,
  title,
  parts,
}: {
  ctx: PageContext;
  title: string;
  parts: { key: string; label: string; colour?: string; minor: number; share: number }[];
}) {
  const { hh, money } = ctx;
  if (!parts.length) return null;
  const coloured = parts.every((p) => p.colour);
  return (
    <Card>
      <SectionHead title={title} />
      {coloured && (
        <StackBar
          parts={parts.map((p) => ({
            value: p.minor,
            colour: p.colour!,
            label: p.label,
            text: money(p.minor),
            tip: `${p.label} · ${money(p.minor)}`,
          }))}
        />
      )}
      <ul className="ov-list">
        {parts.map((p) => (
          <li key={p.key}>
            {p.colour ? (
              <Swatch colour={p.colour} />
            ) : (
              <span className="ov-meter" style={{ ['--w' as string]: `${p.share * 100}%` }} />
            )}
            <span>{p.label}</span>
            <b>{money(p.minor, hh.currency, { whole: true })}</b>
            <span className="muted small">{Math.round(p.share * 100)}%</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

/**
 * A main service's page laid out like a service's own (Health, Lifestyle,
 * Subscriptions): the year ahead and each month on the left with the cards
 * under them; beside them the four figures and where the money goes.
 */
export async function OverviewLayout({
  ctx,
  overview: o,
  count,
  countSub,
  seriesName,
  asideTop,
  children,
}: {
  ctx: PageContext;
  overview: MainOverview;
  /** The fourth figure: how many services, and a line under it. */
  count: number;
  countSub: string;
  seriesName: SeriesName;
  asideTop?: ReactNode;
  children: ReactNode;
}) {
  const t = await getTranslations('main.overview');
  return (
    <div className="d3-cols">
      <div className="d3-main">
        <YearAheadCard ctx={ctx} overview={o} seriesName={seriesName} />
        <MonthsCard ctx={ctx} overview={o} seriesName={seriesName} />
        {children}
      </div>
      <aside className="d3-aside">
        {asideTop}
        <NumsCard
          ctx={ctx}
          overview={o}
          seriesName={seriesName}
          fourth={{ label: t('services'), value: String(count), sub: countSub }}
        />
        <BreakdownCard
          ctx={ctx}
          title={t('byService')}
          parts={o.bySeries.map((s) => ({ ...s, label: seriesName(s.key, s.label) }))}
        />
      </aside>
    </div>
  );
}
