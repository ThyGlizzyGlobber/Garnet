import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { Icon } from '@/components/app/icons';
import { formatMoneyParts } from '@/lib/format';
import type { PageContext } from '@/lib/context';
import type { Lens, LensFigure, ServicesPage } from '@/lib/services-view';
import { addMonths } from '@/lib/periods';

const LENSES: Lens[] = ['month', 'year', 'fy'];

/**
 * The analytics tool (SCOPE-services.md §3a, V-D9): one card holding the
 * three lenses, the lit one unfolded with its figure, change, bars and
 * facts, the other two folded to their figure. Arrows step a period; a bar
 * in the month lens opens that month; a folded lens lights on a tap. Every
 * move is a link, so the lens and period live in the URL.
 */
export async function Analytics({
  view,
  ctx,
  href,
}: {
  view: ServicesPage;
  ctx: PageContext;
  /** A link to the page with some of the lens and periods changed. */
  href: (q: { lens?: Lens; month?: string; year?: string; fy?: string }) => string;
}) {
  const t = await getTranslations('services.lens');
  const { hh, money, month, pct } = ctx;
  const parts = (minor: number) => formatMoneyParts(minor, hh.currency, hh.locale);
  const thisMonth = ctx.today.slice(0, 7);

  /** The period's name: "September", "2026", "2026–27". */
  const name = (f: LensFigure) => (f.lens === 'month' ? month(f.period, 'long') : f.label);
  const periodKey = (lens: Lens) => (lens === 'month' ? 'month' : lens === 'year' ? 'year' : 'fy');
  /** The period before, named, for the change line. */
  const before = (f: LensFigure) =>
    f.lens === 'month'
      ? month(addMonths(f.period, -1), 'long')
      : f.lens === 'year'
        ? t('toDate', { period: String(Number(f.period) - 1) })
        : t('toDate', { period: 'FY ' + String(Number(f.period) - 1) + '–' + f.period.slice(2) });
  const changeLine = (f: LensFigure) => {
    const c = f.change;
    const what = f.lens === 'month' ? t('whatMonth') : t('whatYear');
    const bills =
      f.lens === 'month' && f.facts.lens === 'month'
        ? `${t('bills', { count: f.bills })}${f.bills ? `, ${t('paidOf', { count: f.facts.paidBills })}` : ''}`
        : t('bills', { count: f.bills });
    const head = c
      ? t(`change.${c.dir}`, { pct: pct(Math.abs(c.pct)), period: before(f) })
      : t('change.none', { what });
    return (
      <span className="an-sub">
        <b className={c?.dir === 'up' ? 'an-up' : c?.dir === 'down' ? 'an-down' : ''}>{head}</b>
        {' · '}
        {bills}
      </span>
    );
  };
  const nav = (f: LensFigure) => {
    const key = periodKey(f.lens);
    return (
      <span className="an-nav">
        <Link
          href={href({ lens: f.lens, [key]: f.prev })}
          className="ibtn an-ar"
          aria-label={t(`prev.${f.lens}`)}
        >
          <Icon name="chevron-left" width={15} height={15} />
        </Link>
        <b>{name(f)}</b>
        {f.next ? (
          <Link
            href={href({ lens: f.lens, [key]: f.next })}
            className="ibtn an-ar"
            aria-label={t(`next.${f.lens}`)}
          >
            <Icon name="chevron-right" width={15} height={15} />
          </Link>
        ) : (
          <span className="an-ar is-off" aria-hidden="true" />
        )}
      </span>
    );
  };
  const figure = (f: LensFigure) => {
    const p = parts(f.totalMinor);
    return (
      <b className="an-fig fig">
        {p.main}
        <small>{p.minor}</small>
        {p.tail}
      </b>
    );
  };
  /** A bar a month; the month lens's bars open their month. */
  const bars = (f: LensFigure) => {
    const max = Math.max(1, ...f.bars.map((b) => Math.max(b.minor, b.ghost ?? 0)));
    const h = (n: number) => `${Math.round((n / max) * 100)}%`;
    return (
      <span className="an-bars" aria-hidden="true">
        {f.bars.map((b) => {
          const inner = (
            <>
              {b.ghost !== null && b.ghost > 0 && (
                <i className="an-ghost" style={{ height: h(b.ghost) }} />
              )}
              <i
                className={`an-bar${b.lit ? ' lit' : ''}${b.future || !b.minor ? ' empty' : ''}`}
                style={{ height: b.minor ? h(b.minor) : undefined }}
              />
              <span className={b.lit ? 'on' : undefined}>{month(b.month, 'short')}</span>
            </>
          );
          return f.lens === 'month' && b.month <= addMonths(thisMonth, 1) ? (
            <Link
              key={b.month}
              href={href({ lens: 'month', month: b.month })}
              className="an-col"
              title={t('openMonth', { month: month(b.month, 'long-year') })}
            >
              {inner}
            </Link>
          ) : (
            <span key={b.month} className="an-col">
              {inner}
            </span>
          );
        })}
      </span>
    );
  };
  const caption = (f: LensFigure) =>
    f.lens === 'month'
      ? t('caption.month', { month: month(f.period, 'long') })
      : f.lens === 'year'
        ? t('caption.year', { year: String(Number(f.period) - 1) })
        : t('caption.fy', {
            from: month(f.start.slice(0, 7), 'long'),
            to: month(f.end.slice(0, 7), 'long'),
            year: `FY ${String(Number(f.period) - 1)}–${f.period.slice(2)}`,
          });
  const stat = (label: string, value: string, sub?: string) => (
    <span className="an-stat">
      <span>{label}</span>
      <b>{value}</b>
      {sub && <em>{sub}</em>}
    </span>
  );
  const facts = (f: LensFigure) => {
    const x = f.facts;
    if (x.lens === 'month')
      return (
        <>
          {stat(t('facts.paid'), money(x.paidMinor), t('bills', { count: x.paidBills }))}
          {stat(
            t('facts.toPay'),
            money(x.toPayMinor),
            x.overdue
              ? t('facts.overdue', { count: x.overdue })
              : t('bills', { count: x.toPayBills }),
          )}
          {stat(t('facts.toCome'), String(x.toCome), t('facts.expected'))}
        </>
      );
    if (x.lens === 'year')
      return (
        <>
          {stat(
            t('facts.aMonth'),
            money(x.aMonthMinor, hh.currency, { whole: true }),
            t('facts.average'),
          )}
          {x.highest
            ? stat(
                t('facts.highest'),
                money(x.highest.minor, hh.currency, { whole: true }),
                month(x.highest.month, 'long'),
              )
            : stat(t('facts.highest'), '—')}
          {stat(
            t('facts.lastYear', { year: String(Number(f.period) - 1) }),
            money(x.lastYearMinor, hh.currency, { whole: true }),
            t('facts.wholeYear'),
          )}
        </>
      );
    return (
      <>
        {stat(
          t('facts.aMonth'),
          money(x.aMonthMinor, hh.currency, { whole: true }),
          t('facts.average'),
        )}
        {stat(
          t('facts.toEnd', { month: month(f.end.slice(0, 7), 'long') }),
          `≈ ${money(x.expectedMinor, hh.currency, { whole: true })}`,
          t('facts.toEndSub'),
        )}
        {stat(
          t('facts.lastYear', { year: `FY ${String(Number(f.period) - 1)}–${f.period.slice(2)}` }),
          money(x.lastYearMinor, hh.currency, { whole: true }),
          t('facts.wholeYear'),
        )}
      </>
    );
  };

  return (
    <div className="glass an rounded-card">
      <div className="an-h">
        <b>{t('analytics')}</b>
        <span>{hh.name}</span>
      </div>
      {LENSES.map((lens) => {
        const f = view.figures[lens];
        const lit = view.lens === lens;
        if (!lit)
          return (
            <Link
              key={lens}
              href={href({ lens })}
              className="an-s fold"
              aria-label={t('open', { lens: t(lens) })}
            >
              <span className="an-t">
                <span className="an-name">{t(lens)}</span>
                <b className="an-when">{name(f)}</b>
              </span>
              {figure(f)}
              {changeLine(f)}
            </Link>
          );
        return (
          <section key={lens} className="an-s lit" aria-current="true">
            <span className="an-t">
              <span className="an-name">{t(lens)}</span>
              {nav(f)}
            </span>
            {figure(f)}
            {changeLine(f)}
            {bars(f)}
            <span className="an-cap">
              <span>{caption(f)}</span>
              {lens === 'fy' && (
                <a href={`/api/export?kind=zip&fy=${f.period}`} className="an-dl">
                  <Icon name="download" width={13} height={13} />
                  {t('facts.download')}
                </a>
              )}
            </span>
            <span className="an-facts">{facts(f)}</span>
          </section>
        );
      })}
    </div>
  );
}
