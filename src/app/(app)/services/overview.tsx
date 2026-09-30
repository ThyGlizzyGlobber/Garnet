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
 * A main service's page laid out like a service's own: the year ahead and
 * the last twelve months by month on the left with the cards under them;
 * beside them the four figures and where the money goes (by kind or service,
 * and by vehicle). Numbers from mainOverview().
 */
export async function OverviewLayout({
  ctx,
  overview: o,
  kind,
  count,
  countSub,
  seriesName,
  asideTop,
  children,
}: {
  ctx: PageContext;
  overview: MainOverview;
  /** Rows are vehicles (series are kinds) or services (series are the services). */
  kind: 'vehicle' | 'service';
  /** The fourth figure: how many vehicles or services, and a line under it. */
  count: number;
  countSub: string;
  /** A series' name as the page words it ("Rego"). */
  seriesName: (key: string, label: string) => string;
  asideTop?: ReactNode;
  children: ReactNode;
}) {
  const { hh, money, month, today } = ctx;
  const t = await getTranslations('main.overview');
  const rc = rowCtx(ctx, await getTranslations('ui'));
  const whole = (minor: number) => money(minor, hh.currency, { whole: true });
  const byKey = new Map(o.series.map((s) => [s.key, s]));
  const name = (key: string) => {
    const s = byKey.get(key);
    return s ? seriesName(s.key, s.label) : '';
  };
  const colour = (key: string) => byKey.get(key)?.colour ?? '#2a78d6';
  const anyAhead = o.ahead.rows.some((r) => r.items.length > 0);
  const next = o.next;

  return (
    <div className="d3-cols">
      <div className="d3-main">
        <Card>
          <SectionHead title={t('ahead')} right={<span className="muted">{t('aheadHint')}</span>} />
          {anyAhead ? (
            <YearAhead
              label={t('ahead')}
              months={o.ahead.months.map((m) => month(m, 'short'))}
              rows={o.ahead.rows.map((r) => ({
                key: r.key,
                label: r.label,
                items: r.items.map((i, n) => ({
                  key: `${i.billId ?? 'x'}-${n}`,
                  col: o.ahead.months.indexOf(i.month),
                  // Outlined marks are expected ones: no "~" needed.
                  amount: i.amountMinor === null ? '?' : whole(i.amountMinor),
                  colour: colour(i.seriesKey),
                  tip: `${name(i.seriesKey)} · ${r.label} · ${
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
        <Card>
          <SectionHead
            title={t('byMonth')}
            right={<span className="muted">{t('byMonthHint')}</span>}
          />
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
        {children}
      </div>

      <aside className="d3-aside">
        {asideTop}
        <Card className="d3-nums">
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
              {next
                ? next.amountMinor === null
                  ? '—'
                  : next.status
                    ? money(next.amountMinor)
                    : `≈ ${whole(next.amountMinor)}`
                : '—'}
            </b>
            <span className="muted small">
              {next
                ? `${next.rowLabel || name(next.seriesKey)} · ${
                    next.status
                      ? lowerFirst(statusLabel(rc, next.status))
                      : t('expectedOn', { date: rc.date(next.dueDate) })
                  }`
                : t('nothingNext')}
            </span>
          </div>
          <div>
            <span className="muted small">{t(kind === 'vehicle' ? 'vehicles' : 'services')}</span>
            <b>{count}</b>
            <span className="muted small">{countSub}</span>
          </div>
        </Card>

        {o.bySeries.length > 0 && (
          <Card>
            <SectionHead title={t(kind === 'vehicle' ? 'byKind' : 'byService')} />
            <StackBar
              parts={o.bySeries.map((s) => ({
                value: s.minor,
                colour: s.colour,
                label: seriesName(s.key, s.label),
                text: money(s.minor),
                tip: `${seriesName(s.key, s.label)} · ${money(s.minor)}`,
              }))}
            />
            <ul className="ov-list">
              {o.bySeries.map((s) => (
                <li key={s.key}>
                  <Swatch colour={s.colour} />
                  <span>{seriesName(s.key, s.label)}</span>
                  <b>{whole(s.minor)}</b>
                  <span className="muted small">{Math.round(s.share * 100)}%</span>
                </li>
              ))}
            </ul>
          </Card>
        )}

        {kind === 'vehicle' && o.byRow.length > 1 && (
          <Card>
            <SectionHead title={t('byVehicle')} />
            <ul className="ov-list">
              {o.byRow.map((r) => (
                <li key={r.key}>
                  <span className="ov-meter" style={{ ['--w' as string]: `${r.share * 100}%` }} />
                  <span>{r.label}</span>
                  <b>{whole(r.minor)}</b>
                  <span className="muted small">{Math.round(r.share * 100)}%</span>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </aside>
    </div>
  );
}
