import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { Icon } from '@/components/app/icons';
import { LinkButton } from '@/components/ui';
import { PageTitle } from '@/components/ui/blocks';
import { StatusPill } from '@/components/ui/list-row';
import { budgetView, type BudgetMonth } from '@/lib/budget';
import { pageContext } from '@/lib/context';
import { formatMoneyParts } from '@/lib/format';
import { isAdmin } from '@/lib/roles';

/**
 * Budget (SCOPE-redesign-2.md §5): "have I budgeted enough for the year's
 * bills?" The headline card (the projected total for the year, a verdict
 * against the yearly budget when one is set, a bar scaled to it, paid so far
 * and still to come, and the line that says what the projection rests on),
 * the set-aside card, the twelve months as bars (paid solid, estimated
 * dashed, each a button to that month's bills), the big bills ahead, where
 * it goes (Essentials against the rest), and two ways to make it more
 * accurate. Numbers from budgetView().
 */
export default async function BudgetPage() {
  const ctx = await pageContext();
  const { hh, me, money, month } = ctx;
  const t = await getTranslations('budget');
  const v = budgetView(hh, me, ctx.today);
  const admin = isAdmin(me);
  const whole = (minor: number) => money(minor, hh.currency, { whole: true });
  const compact = (minor: number) =>
    minor >= 100_000 ? money(minor, hh.currency, { compact: true }) : whole(minor);
  const dm = new Intl.DateTimeFormat(hh.locale, {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });
  const dmy = new Intl.DateTimeFormat(hh.locale, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
  const day = (ymd: string) => dm.format(new Date(`${ymd}T00:00:00Z`));
  const dayYear = (ymd: string) => dmy.format(new Date(`${ymd}T00:00:00Z`));
  const yearShort =
    v.basis === 'fy'
      ? t('fyShort', { from: v.startYear, to: String(v.startYear + 1).slice(2) })
      : t('cyShort', { year: v.startYear });
  const period =
    v.basis === 'fy'
      ? t('fyPeriod', { from: dayYear(v.start), to: dayYear(v.end) })
      : t('cyPeriod', { year: v.startYear });
  const projected = formatMoneyParts(v.projectedMinor, hh.currency, hh.locale);
  const budget = v.budgetMinor;
  const over = budget !== null && v.projectedMinor > budget;
  const diff = budget !== null ? Math.abs(v.projectedMinor - budget) : 0;

  // The bar: paid and still-to-come as parts of the budget (or of the projection with none).
  const scale = Math.max(budget ?? 0, v.projectedMinor, 1);
  const paidPct = Math.round((v.paidMinor / scale) * 10000) / 100;
  const comePct = Math.round(((v.projectedMinor - v.paidMinor) / scale) * 10000) / 100;

  // The chart: each month's paid (solid) and expected (dashed), scaled to the tallest month.
  const total = (m: BudgetMonth) => m.paidMinor + m.toPayMinor + m.expectedMinor;
  const max = Math.max(1, ...v.months.map(total));
  const h = (minor: number) => Math.round((minor / max) * 220);
  const barLabel = (m: BudgetMonth) => {
    const name = month(m.month, 'long');
    const est = m.toPayMinor + m.expectedMinor;
    if (m.paidMinor && est)
      return t('monthMixed', { month: name, paid: whole(m.paidMinor), expected: whole(est) });
    if (m.paidMinor) return t('monthPaid', { month: name, amount: whole(m.paidMinor) });
    if (est) return t('monthExpected', { month: name, amount: whole(est) });
    return t('monthNothing', { month: name });
  };
  const tallest = v.months.reduce((a, b) => (total(b) > total(a) ? b : a), v.months[0]!);
  const aheadMax = Math.max(1, ...v.bigAhead.map((m) => m.totalMinor));
  const splitTotal = v.split.essentialsMinor + v.split.otherMinor;
  const essPct = splitTotal ? Math.round((v.split.essentialsMinor / splitTotal) * 100) : 0;
  const bi = v.basisInfo;
  const basisLine =
    bi.monthsOfBills === 0
      ? t('basisNoMonths')
      : t('basis', {
          months: bi.monthsOfBills,
          from: month(bi.firstMonth!, 'short'),
          to: month(bi.lastMonth!, 'short'),
          yearly: bi.yearlyBills,
        });

  return (
    <div className="scr">
      <PageTitle
        title={t('title')}
        lede={t('lede', { period })}
        right={
          admin ? (
            <LinkButton href="/budget/edit" variant="secondary" icon="pencil">
              {budget === null ? t('setBudget') : t('editBudget')}
            </LinkButton>
          ) : undefined
        }
      />

      <div className="two-up">
        {/* The headline: the projected total and, with a budget, the verdict. */}
        <section className="rd-card bg-hero wide" aria-labelledby="bg-hero-t">
          <div className="bg-hero-h">
            <h2 id="bg-hero-t" className="lbl">
              {t('projected', { year: yearShort })}
            </h2>
            {budget !== null ? (
              over ? (
                <StatusPill tone="bad">{t('over', { amount: whole(diff) })}</StatusPill>
              ) : (
                <StatusPill tone="ok">{t('onTrack')}</StatusPill>
              )
            ) : admin ? (
              <Link href="/budget/edit" className="tlink">
                {t('setBudget')}
                <Icon name="arrow-right" width={16} height={16} />
              </Link>
            ) : null}
          </div>
          <div>
            <div className="hero-num md">
              <span className="approx">≈</span>
              {projected.main}
            </div>
            <p className="bg-hero-line">
              {budget === null
                ? t('noBudgetLine')
                : over
                  ? t('overLine', { amount: whole(diff), budget: whole(budget) })
                  : t('underLine', { amount: whole(diff), budget: whole(budget) })}
            </p>
          </div>
          <div>
            <div
              role="img"
              aria-label={t('barLabel', { paid: Math.round(paidPct), come: Math.round(comePct) })}
              className="bg-bar"
            >
              <span className="bg-bar-paid" style={{ width: `${paidPct}%` }} />
              <span className="bg-bar-come" style={{ width: `${comePct}%` }} />
            </div>
            <div className="bg-bar-ends">
              <span>{whole(0)}</span>
              <span>
                {budget !== null
                  ? t('budgetMark', { amount: whole(budget) })
                  : t('approx', { amount: whole(v.projectedMinor) })}
              </span>
            </div>
          </div>
          <div className="bg-facts rule-top">
            <div>
              <p className="lbl-sm">{t('paidSoFar')}</p>
              <p className="bg-fact">{money(v.paidMinor)}</p>
              <p className="bg-fact-s">{t('paidBills', { count: v.paidBills })}</p>
            </div>
            <div>
              <p className="lbl-sm">{t('stillToCome')}</p>
              <p className="bg-fact">
                {t('approx', { amount: whole(v.projectedMinor - v.paidMinor) })}
              </p>
              <p className="bg-fact-s">{t('estimated')}</p>
            </div>
          </div>
          <p className="bg-basis">
            <Icon name="info" width={16} height={16} />
            <span>
              {basisLine}
              {bi.probablyLow && <> {t('probablyLow')}</>}
              {!bi.fullHistory && !bi.probablyLow && <> {t('addLastYear')}</>}
            </span>
          </p>
        </section>

        {/* Set aside each month. */}
        <section className="rd-card bg-aside narrow" aria-labelledby="bg-aside-t">
          <div className="h2row">
            <Icon name="piggy" width={20} height={20} />
            <h2 id="bg-aside-t">{t('setAside')}</h2>
          </div>
          <p className="bg-aside-fig">{whole(v.setAsideMinor)}</p>
          <p className="bg-aside-body">
            {tallest && total(tallest) > 0 && tallest.month > v.thisMonth
              ? t('setAsideBody', { month: month(tallest.month, 'long') })
              : t('setAsideBodyPlain')}
          </p>
          <p className="bg-aside-note">{t('setAsideNote', { total: whole(v.projectedMinor) })}</p>
        </section>
      </div>

      <div className="two-up">
        {/* Month by month: paid solid, estimated dashed. */}
        <section className="rd-card bg-chart wide" aria-labelledby="bg-chart-t">
          <div className="bg-chart-h">
            <div className="h2row">
              <Icon name="bars" width={20} height={20} />
              <h2 id="bg-chart-t">{t('monthByMonth')}</h2>
            </div>
            <div className="bg-legend">
              <span>
                <i className="sol" />
                {t('legendPaid')}
              </span>
              <span>
                <i className="est" />
                {t('legendEstimated')}
              </span>
            </div>
          </div>
          <div className="bars tall">
            {v.months.map((m) => {
              const est = m.toPayMinor + m.expectedMinor;
              const now = m.month === v.thisMonth;
              // The standout months carry their figure (the tallest, and any within a tenth of it).
              const big = total(m) >= max * 0.9 && total(m) > 0;
              return (
                <Link
                  key={m.month}
                  href={`/bills?m=${m.month}`}
                  className={`bar${now ? ' on' : ''}`}
                  aria-label={barLabel(m)}
                  aria-current={now ? 'true' : undefined}
                >
                  {big && (
                    <span className="val">
                      {est && !m.paidMinor
                        ? t('approxK', { amount: compact(total(m)) })
                        : compact(total(m))}
                    </span>
                  )}
                  <span className="col">
                    {est > 0 && (
                      <span
                        className={`est${m.paidMinor ? ' top' : ''}`}
                        style={{ height: Math.max(3, h(est)) }}
                      />
                    )}
                    {m.paidMinor > 0 && (
                      <span
                        className={`sol${est ? ' bottom' : ''}${now ? ' lit' : ''}`}
                        style={{ height: Math.max(3, h(m.paidMinor)) }}
                      />
                    )}
                    {!est && !m.paidMinor && <span className="sol" style={{ height: 3 }} />}
                  </span>
                  {month(m.month, 'short')}
                </Link>
              );
            })}
          </div>
          <p className="bg-tap">{t('tapMonth')}</p>
        </section>

        {/* Big bills ahead. */}
        {v.bigAhead.length > 0 && (
          <section className="rd-card bg-big narrow" aria-labelledby="bg-big-t">
            <div className="h2row">
              <Icon name="calendar" width={20} height={20} />
              <h2 id="bg-big-t">{t('bigBills')}</h2>
            </div>
            <div className="bg-big-rows">
              {v.bigAhead.map((m, i) => (
                <div key={m.month}>
                  <div className="mrow">
                    <span>{month(m.month, 'long')}</span>
                    <span className="meter">
                      <i
                        className={i === 0 && m.totalMinor === aheadMax ? 'lead' : undefined}
                        style={{ width: `${Math.round((m.totalMinor / aheadMax) * 100)}%` }}
                      />
                    </span>
                    <span>{t('approx', { amount: whole(m.totalMinor) })}</span>
                  </div>
                  {i === 0 && m.biggest && (
                    <p className="mrow-note">
                      {t('includes', { name: m.biggest.serviceName, date: day(m.biggest.dueDate) })}
                    </p>
                  )}
                </div>
              ))}
            </div>
            <Link href="/bills?w=upcoming" className="tlink push">
              {t('allTwelve')}
              <Icon name="arrow-right" width={16} height={16} />
            </Link>
          </section>
        )}
      </div>

      {/* Where it goes: Essentials against everything else. */}
      {splitTotal > 0 && (
        <section className="rd-card rd-pad bg-split" aria-labelledby="bg-split-t">
          <div className="bg-chart-h">
            <div className="h2row">
              <Icon name="split-bar" width={20} height={20} />
              <h2 id="bg-split-t">{t('whereItGoes')}</h2>
            </div>
            <Link href="/services" className="tlink">
              {t('seeServices')}
              <Icon name="arrow-right" width={16} height={16} />
            </Link>
          </div>
          <div
            role="img"
            aria-label={t('splitLabel', { ess: essPct, other: 100 - essPct })}
            className="bg-split-bar"
          >
            <span className="ess" style={{ width: `${essPct}%` }} />
            <span className="oth" style={{ width: `${100 - essPct}%` }} />
          </div>
          <div className="bg-split-legend">
            <div>
              <i className="ess" />
              <b>{t('essentials')}</b>
              <span>{t('approx', { amount: whole(v.split.essentialsMinor) })}</span>
              <small>{essPct}%</small>
            </div>
            <div>
              <i className="oth" />
              <b>{t('other')}</b>
              <span>{t('approx', { amount: whole(v.split.otherMinor) })}</span>
              <small>{100 - essPct}%</small>
            </div>
          </div>
        </section>
      )}

      {/* Make this more accurate. */}
      <section className="rd-card rd-pad bg-acc" aria-labelledby="bg-acc-t">
        <div>
          <h2 id="bg-acc-t" className="bg-acc-t">
            {t('accurate')}
          </h2>
          <p className="bg-acc-body">{t('accurateBody')}</p>
        </div>
        <div className="bg-acc-opts">
          <Link href="/inbox" className="opt lead">
            <b>{t('optBackfill')}</b>
            <span>{t('optBackfillBody')}</span>
          </Link>
          <Link href="/budget/yearly" className="opt">
            <b>{t('optQuick')}</b>
            <span>{t('optQuickBody')}</span>
          </Link>
        </div>
      </section>
    </div>
  );
}
