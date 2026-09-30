import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { billRowFor, rowCtx, statusLabel } from '@/components/app/bill-rows';
import { PeriodBars } from '@/components/charts/period-bars';
import { StackBar } from '@/components/charts/stack-bar';
import { Card, LinkButton } from '@/components/ui';
import { Delta, Kv, Notice, PageTitle, SectionHead } from '@/components/ui/blocks';
import { Chip } from '@/components/ui/chip';
import { Avatar, Disc } from '@/components/ui/colour';
import { BackLink } from '@/components/ui/controls';
import { BillRow, Rows } from '@/components/ui/rows';
import { Pager } from '@/components/ui/pager';
import { pageParam, paginate } from '@/lib/paging';
import { SAME_BAND } from '@/lib/averages';
import { DAYS_PER_MONTH } from '@/lib/consumption';
import { pageContext } from '@/lib/context';
import { formatMonthRange, formatRate } from '@/lib/format';
import { isAdmin } from '@/lib/roles';
import { visibleTo } from '@/lib/scope';
import { seasonNoticeText } from '@/lib/season-text';
import { serviceOverview } from '@/lib/service-overview';
import { getMember } from '@/lib/members';
import { chargedAfterCancel, getService } from '@/lib/services';
import { listBills } from '@/lib/bills';
import { InlineAction } from '@/components/ui/form';
import { cancelServiceAction, resumeServiceAction } from '../actions';
import { unitLabel } from '@/lib/units';
import { formatMonth } from '@/lib/format';
import { partText } from '../split-text';

/**
 * A service, long-form: a sentence that says how it's going, its bills as
 * bars, every bill by year, and beside them the year's figures, what it's
 * compared with, how it's split and what's coming. Numbers come from
 * serviceOverview() (src/lib/service-overview.ts).
 */
/** Bills per page in "Every bill": a year of monthly bills. */
const BILLS_PER_PAGE = 12;

export default async function ServicePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ p?: string }>;
}) {
  const { id } = await params;
  const { p: pageRaw } = await searchParams;
  const ctx = await pageContext();
  const { hh, me, money, month, qty, today } = ctx;
  const t = await getTranslations('usage');
  const ts = await getTranslations('services');
  const tu = await getTranslations('ui');
  const rc = rowCtx(ctx, tu);
  const svc = getService(hh.id, id);
  // Another member's personal service doesn't exist, as far as anyone else can tell.
  if (!svc || !visibleTo(svc.ownerMemberId, me.id)) notFound();
  const o = serviceOverview(hh, svc, today);
  const c = o.usage;
  const unit = unitLabel(o.unit);
  const pctOf = (x: number) => Math.round(Math.abs(x) * 100);
  const dirOf = (x: number | null): 'up' | 'down' | 'flat' =>
    x === null || Math.abs(x) < SAME_BAND ? 'flat' : x > 0 ? 'up' : 'down';
  const personal = !!svc.ownerMemberId;
  const split = o.split;
  const payer = split?.parts.find((p) => p.member.id === svc.payerMemberId)?.member;
  const payerName = payer?.name ?? null;
  // A sub-service (Netflix under Subscriptions): back to its main service,
  // and it can be cancelled.
  const sub = svc.type.hasSubServices;
  const cancelledBy = svc.cancelledByMemberId ? getMember(hh.id, svc.cancelledByMemberId) : null;
  const afterCancel = svc.cancelledAt
    ? listBills(hh.id, { serviceId: svc.id }).filter((b) => chargedAfterCancel(svc, b))
    : [];

  // "Northwind Energy, quarterly. $1,864 last financial year, about $155 a
  // month. The latest bill used 5% more than the same time last year…"
  const lastYear = o.comparisons.find((r) => r.against === 'lastYear');
  const limit = o.comparisons.find((r) => r.against === 'limit');
  const lede = [
    ts('page.ledeProvider', {
      provider: svc.provider,
      cadence: ts(`form.cadences.${svc.cadence}`).toLowerCase(),
    }),
    o.stats.year.bills
      ? ts(o.stats.year.current ? 'page.ledeYearSoFar' : 'page.ledeYear', {
          total: money(o.stats.year.minor, hh.currency, { whole: true }),
          month: money(o.stats.year.perMonthMinor, hh.currency, { whole: true }),
          label: o.stats.year.label,
        })
      : ts('page.ledeNoBills'),
    lastYear?.usage.pct != null && Math.abs(lastYear.usage.pct) >= SAME_BAND
      ? ts('page.ledeLastYear', {
          pct: pctOf(lastYear.usage.pct),
          dir: lastYear.usage.pct > 0 ? 'more' : 'less',
          limit:
            limit?.usage.pct != null
              ? ts(limit.usage.pct > 0 ? 'page.ledeOverLimit' : 'page.ledeUnderLimit', {
                  pct: pctOf(limit.usage.pct),
                })
              : '',
        })
      : personal
        ? ts('page.ledeYours')
        : hh.splitMode === 'shared' && payerName
          ? ts('page.ledePays', { name: payerName === me.name ? ts('page.you') : payerName })
          : '',
  ]
    .filter(Boolean)
    .join(' ');

  const chips = (
    <>
      {personal ? (
        <Chip tone="info" icon="user">
          {ts('page.chipYours')}
        </Chip>
      ) : (
        <Chip tone="neutral" icon="users">
          {ts('page.chipHousehold')}
        </Chip>
      )}
      {(personal || payerName) && (
        <Chip tone="neutral" icon="arrow-right">
          {personal || payer?.id === me.id
            ? ts('page.chipYouPay')
            : ts('page.chipPays', { name: payerName ?? '' })}
        </Chip>
      )}
      {svc.seasonal && (
        <Chip tone="neutral" icon="sun">
          {ts('form.seasonal')}
        </Chip>
      )}
      {svc.cancelledAt ? (
        <Chip tone={afterCancel.length ? 'bad' : 'neutral'} icon="x">
          {ts('cancelled')}
        </Chip>
      ) : (
        !svc.isActive && <Chip tone="neutral">{ts('inactive')}</Chip>
      )}
    </>
  );

  const againstLabel = (r: (typeof o.comparisons)[number]) =>
    r.against === 'average'
      ? t('vs.average', { count: r.bills ?? 0 })
      : r.against === 'limit'
        ? t('vs.limitShort')
        : t(`vs.${r.against}`);
  const againstSub = (r: (typeof o.comparisons)[number]) =>
    r.period
      ? `${formatMonthRange(r.period.periodStart, r.period.periodEnd, hh.locale)}${r.period.periodEnd.slice(0, 4) !== today.slice(0, 4) && r.period.periodStart.slice(0, 4) === r.period.periodEnd.slice(0, 4) ? ` ${r.period.periodEnd.slice(0, 4)}` : ''}${r.period.perDay !== null ? ` · ${t('perDay', { qty: qty(r.period.perDay), unit })}` : ''}`
      : r.against === 'limit'
        ? t('vs.limitSub', { qty: qty(r.limit ?? 0), unit })
        : r.against === 'similar'
          ? t('vs.similarSub')
          : r.cost?.pct != null
            ? t('costChange', {
                change:
                  Math.abs(r.cost.pct) < SAME_BAND
                    ? t('same')
                    : r.cost.pct > 0
                      ? t('more', { pct: pctOf(r.cost.pct) })
                      : t('less', { pct: pctOf(r.cost.pct) }),
              })
            : '';

  const tw = await getTranslations('weather.adjusted');
  const adj = o.weather;
  const weatherLine = adj
    ? [
        tw('sentence', {
          against: tw(adj.against),
          change: tw(`${adj.measure}${adj.actual >= 0 ? 'More' : 'Less'}`, {
            pct: pctOf(adj.actual),
          }),
          weather: adj.weather
            ? tw('weatherClause', { text: tw(adj.weather.kind, { pct: pctOf(adj.weather.pct) }) })
            : '',
        }),
        Math.abs(adj.adjusted) < SAME_BAND
          ? tw('adjustedSame')
          : tw(adj.adjusted > 0 ? 'adjustedMore' : 'adjustedLess', { pct: pctOf(adj.adjusted) }),
        tw('explains', { pct: pctOf(adj.r2) }),
      ].join(' ')
    : null;
  const tse = await getTranslations('seasons');
  const tr = (key: string, vars?: Record<string, string | number>) =>
    tse(key as Parameters<typeof tse>[0], vars as Parameters<typeof tse>[1]);
  const season = o.seasons[0]
    ? seasonNoticeText(o.seasons[0], tr, {
        money,
        month: (ym: string) => formatMonth(ym, hh.locale, 'long-year'),
      })
    : null;
  const ta = await getTranslations('area');
  const area = o.area;
  // "Every bill", a page at a time (newest first), under each year's heading
  // with the whole year's count and total.
  const billPage = paginate(o.bills, pageParam(pageRaw), BILLS_PER_PAGE);
  const pageYears = o.byYear
    .map((y) => ({
      year: y.year,
      count: y.bills.length,
      totalMinor: y.totalMinor,
      bills: y.bills.filter((b) => billPage.items.includes(b)),
    }))
    .filter((y) => y.bills.length > 0);
  const tp = await getTranslations('ui.pager');
  const pagerLabels = {
    nav: tp('nav'),
    previous: tp('previous'),
    next: tp('next'),
    page: (n: number) => tp('page', { n }),
  };
  const tsp = await getTranslations('services.split');
  const chartTitle = o.barsAreUsage
    ? t('chartUsage')
    : o.barsPerBill
      ? t('chartCostBill')
      : t('chartCost');

  return (
    <div className="scr d3-service">
      {sub ? (
        <BackLink href={`/services/group/${svc.typeSlug}`}>{svc.type.label}</BackLink>
      ) : (
        <BackLink href="/services">{ts('title')}</BackLink>
      )}
      <PageTitle
        eyebrow={`${svc.type.label} · ${ts(`form.cadences.${svc.cadence}`)}`}
        title={svc.name}
        lede={lede}
        lead
        chips={chips}
        right={
          <LinkButton href={`/services/${svc.id}/edit`} variant="secondary" size="sm" icon="pencil">
            {ts('edit')}
          </LinkButton>
        }
      />
      <div className="d3-cols">
        <div className="d3-main">
          <Card>
            <SectionHead
              title={chartTitle}
              right={o.bars.length > 0 && <span className="muted">{t('chartEach')}</span>}
            />
            {o.bars.length > 0 ? (
              <PeriodBars
                colour={svc.colour}
                label={chartTitle}
                bars={o.bars.slice(-12).map((b) => ({
                  from: b.periodStart,
                  to: b.periodEnd,
                  value: b.value,
                  label:
                    Date.parse(b.periodEnd) - Date.parse(b.periodStart) > 45 * 86_400_000
                      ? month(b.periodStart.slice(0, 7), 'short')
                      : '',
                  tip: `${formatMonthRange(b.periodStart, b.periodEnd, hh.locale)} · ${
                    o.barsAreUsage && b.usage !== null
                      ? `${t('perDay', { qty: qty(b.usage), unit })} · `
                      : o.barsPerBill
                        ? ''
                        : `${t('costPerDay', { amount: money(Math.round(b.value)) })} · `
                  }${money(b.amountMinor)}`,
                  href: `/bills/${b.billId}`,
                  flag: b.unusual,
                }))}
                reference={
                  o.barsAreUsage && svc.usageLimitMonthly
                    ? {
                        value: (svc.usageLimitMonthly * 12) / 365,
                        label: t('limitLine', {
                          qty: qty(Math.round(((svc.usageLimitMonthly * 12) / 365) * 10) / 10),
                          unit,
                        }),
                      }
                    : undefined
                }
              />
            ) : (
              <p className="muted">{t('none')}</p>
            )}
          </Card>
          {o.bands.length > 0 && (
            <Card>
              <SectionHead
                title={t('bands')}
                right={<span className="muted">{t('bandsHint')}</span>}
              />
              <div className="compare">
                {o.bands.map((p) => (
                  <div key={p.key} className="cmp">
                    <span className="cmp-l">{p.label}</span>
                    <span className="cmp-v">
                      <Delta dir={dirOf(p.change?.pct ?? null)}>
                        {p.change?.pct != null && Math.abs(p.change.pct) >= SAME_BAND
                          ? `${p.change.pct > 0 ? '+' : '−'}${pctOf(p.change.pct)}%`
                          : t('same')}
                      </Delta>
                    </span>
                    <span className="cmp-s">{t('perDay', { qty: qty(p.perDay), unit })}</span>
                  </div>
                ))}
              </div>
            </Card>
          )}
          <Card className="d3-every" id="bills">
            <SectionHead
              title={ts('page.everyBill')}
              right={
                <span className="muted">{ts('page.billCount', { count: o.bills.length })}</span>
              }
            />
            {o.bills.length === 0 ? (
              <p className="muted">{ts('page.noBills')}</p>
            ) : (
              <>
                <div className="d3-tl">
                  {pageYears.map((y) => (
                    <div key={y.year} className="year-group">
                      <div className="year-h">
                        <span>{y.year}</span>
                        <span className="muted">
                          {ts('page.billCount', { count: y.count })} ·{' '}
                          {money(y.totalMinor, hh.currency, { whole: true })}
                        </span>
                      </div>
                      <Rows>
                        {y.bills.map((b) => (
                          <BillRow
                            key={b.id}
                            bill={billRowFor(b, rc, { inService: true, noDisc: true })}
                          />
                        ))}
                      </Rows>
                    </div>
                  ))}
                </div>
                <Pager
                  page={billPage.page}
                  pages={billPage.pages}
                  href={(n) => `/services/${svc.id}${n > 1 ? `?p=${n}` : ''}#bills`}
                  labels={pagerLabels}
                />
              </>
            )}
          </Card>
        </div>

        <aside className="d3-aside">
          {svc.cancelledAt && (
            <Notice
              tone={afterCancel.length ? 'bad' : 'neutral'}
              icon={afterCancel.length ? 'alert' : 'x'}
              title={
                cancelledBy
                  ? ts('cancel.byOn', {
                      name: cancelledBy.id === me.id ? ts('page.you') : cancelledBy.name,
                      date: ctx.date(svc.cancelledAt.slice(0, 10)),
                    })
                  : ts('cancel.on', { date: ctx.date(svc.cancelledAt.slice(0, 10)) })
              }
              body={
                afterCancel.length
                  ? ts('cancel.afterBody', { count: afterCancel.length })
                  : ts('cancel.keptBody')
              }
              href={afterCancel.length ? `/bills/${afterCancel[0]!.id}` : `/bills?s=${svc.id}`}
            />
          )}
          <Card className="d3-nums">
            <div>
              <span className="muted small">
                {ts(o.stats.year.current ? 'page.statYearSoFar' : 'page.statYear')}
              </span>
              <b>{money(o.stats.year.minor, hh.currency, { whole: true })}</b>
              <span className="muted small">
                {ts('page.billCount', { count: o.stats.year.bills })} · {o.stats.year.label}
              </span>
            </div>
            <div>
              <span className="muted small">{ts('page.statMonth')}</span>
              <b>{money(o.stats.year.perMonthMinor, hh.currency, { whole: true })}</b>
              <span className="muted small">{o.stats.year.label}</span>
            </div>
            <div>
              <span className="muted small">{ts('page.statLatest')}</span>
              <b>{o.stats.latest ? money(o.stats.latest.amountMinor) : '—'}</b>
              <span className="muted small">
                {o.stats.latest ? statusLabel(rc, o.stats.latest.status) : ts('noHistory')}
              </span>
            </div>
            <div>
              <span className="muted small">{ts('page.statNext')}</span>
              <b>
                {o.stats.next
                  ? `≈ ${money(o.stats.next.amountMinor, hh.currency, { whole: true })}`
                  : '—'}
              </b>
              <span className="muted small">
                {o.stats.next
                  ? ts('page.expected', { date: rc.date(o.stats.next.dueDate) })
                  : ts('page.noGuess')}
              </span>
            </div>
          </Card>

          {o.unusual && (
            <Notice
              tone="warn"
              icon="trend-up"
              title={ts('page.unusualTitle')}
              body={
                o.unusual.pct !== null
                  ? ts(o.unusual.pct >= 0 ? 'page.unusualAbove' : 'page.unusualBelow', {
                      pct: pctOf(o.unusual.pct),
                      basis: ts(`page.basis.${o.unusual.basis ?? 'recent'}`),
                    })
                  : (o.unusual.note ?? '')
              }
              href={`/bills/${o.unusual.billId}`}
            />
          )}
          {season && (
            <Card>
              <SectionHead title={tse('heading')} />
              <p className="font-semibold">{season.title}</p>
              <p className="muted small mt-1">{season.lines.join(' ')}</p>
            </Card>
          )}

          <Card>
            <SectionHead title={t('comparedWith')} />
            {o.comparisons.length === 0 ? (
              <p className="muted small">{t('none')}</p>
            ) : (
              <div className="compare">
                {o.comparisons.map((r) => (
                  <div key={r.against} className="cmp">
                    <span className="cmp-l">{againstLabel(r)}</span>
                    <span className="cmp-v">
                      <Delta dir={dirOf(r.usage.pct)}>
                        {r.usage.pct === null
                          ? '—'
                          : Math.abs(r.usage.pct) < SAME_BAND
                            ? t('same')
                            : r.against === 'limit'
                              ? t(r.usage.pct > 0 ? 'overLimit' : 'underLimit', {
                                  pct: pctOf(r.usage.pct),
                                })
                              : `${r.usage.pct > 0 ? '+' : '−'}${pctOf(r.usage.pct)}%`}
                      </Delta>
                    </span>
                    <span className="cmp-s">{againstSub(r)}</span>
                  </div>
                ))}
              </div>
            )}
            {c && c.latest.perDay !== null && (
              <p className="muted small mt-3">
                {t('latestLine', {
                  qty: qty(c.latest.perDay),
                  unit,
                  month: qty(c.latest.perDay * DAYS_PER_MONTH),
                })}
              </p>
            )}
            {weatherLine && <p className="muted small mt-2">{weatherLine}</p>}
          </Card>

          {split && split.parts.length > 1 && (
            <Card>
              <SectionHead
                title={tsp('title')}
                right={
                  isAdmin(me) && (
                    <Link href={`/services/${svc.id}/edit#split`} className="btn btn-plain btn-sm">
                      {tsp('change')}
                    </Link>
                  )
                }
              />
              {split.latestMinor !== null && split.latestMinor > 0 && (
                <StackBar
                  parts={split.parts
                    .filter((p) => p.exampleMinor)
                    .map((p) => ({
                      value: p.exampleMinor!,
                      colour: p.member.colour,
                      label: p.member.name,
                      text: money(p.exampleMinor!),
                    }))}
                />
              )}
              <div className="split-people">
                {split.parts.map((p) => (
                  <div key={p.member.id} className="sp-person">
                    <Avatar name={p.member.name} colour={p.member.colour} size="sm" />
                    <span className="truncate">
                      {p.member.id === me.id ? ts('page.you') : p.member.name}
                    </span>
                    <b>{partText(tsp, p.setting, money)}</b>
                    {p.exampleMinor !== null && (
                      <span className="muted">{money(p.exampleMinor)}</span>
                    )}
                  </div>
                ))}
              </div>
              <p className="muted small">
                {tsp(`hints.${split.mode}`)}
                {split.latestMinor !== null &&
                  ` ${tsp('latest', { amount: money(split.latestMinor) })}`}
              </p>
            </Card>
          )}

          {area && (
            <Card>
              <SectionHead title={ta('title')} />
              <p className="muted small">
                {ta(area.sameSize ? 'basisSameSize' : 'basis', {
                  month: month(area.month, 'long-year'),
                  households: area.cost?.households ?? 0,
                  area: area.areaName,
                })}
              </p>
              <div className="compare mt-2">
                {(
                  [
                    ['cost', area.cost, (v: number) => money(Math.round(v))],
                    [
                      'usage',
                      area.usage,
                      (v: number) => `${qty(v)} ${unitLabel(area.usage?.unit)}`,
                    ],
                    [
                      'rate',
                      area.rate,
                      (v: number) =>
                        formatRate(v, area.rate?.unit ?? '', hh.locale, unitLabel, hh.currency),
                    ],
                  ] as const
                )
                  .filter(([, f]) => f)
                  .map(([key, f, show]) => (
                    <div key={key} className="cmp">
                      <span className="cmp-l">{ta(`metric.${key}`)}</span>
                      <span className="cmp-v">
                        {f!.you !== null && f!.median ? (
                          <Delta dir={dirOf((f!.you - f!.median) / f!.median)}>
                            {Math.abs((f!.you - f!.median) / f!.median) < SAME_BAND
                              ? t('same')
                              : `${f!.you > f!.median ? '+' : '−'}${pctOf((f!.you - f!.median) / f!.median)}%`}
                          </Delta>
                        ) : (
                          <span className="muted">{ta('typical', { value: show(f!.median) })}</span>
                        )}
                      </span>
                      <span className="cmp-s">
                        {ta('typical', { value: show(f!.median) })} ·{' '}
                        {ta('range', { low: show(f!.p25), high: show(f!.p75) })}
                      </span>
                    </div>
                  ))}
              </div>
            </Card>
          )}

          {o.comingUp.length > 0 && (
            <Card>
              <SectionHead
                title={t('comingUp.title')}
                right={<span className="muted">{t('comingUp.estimates')}</span>}
              />
              <div className="coming">
                {o.comingUp.map((u) => (
                  <div key={u.month} className="cm">
                    <span className="cm-m">{month(u.month, 'long')}</span>
                    <span className="cm-v">{money(u.minor, hh.currency, { whole: true })}</span>
                    <span className="cm-s">{t(`comingUp.short.${u.method}`)}</span>
                  </div>
                ))}
              </div>
            </Card>
          )}

          <Card>
            <SectionHead title={ts('page.details')} />
            <Kv
              rows={[
                [ts('form.provider'), svc.provider],
                svc.accountRef
                  ? [
                      ts('form.accountRef'),
                      <span key="a" className="mono">
                        {svc.accountRef}
                      </span>,
                    ]
                  : null,
                [ts('form.type'), svc.type.label],
                [ts('form.cadence'), ts(`form.cadences.${svc.cadence}`)],
                o.unit ? [ts('form.usageUnit'), unit] : null,
                svc.usageLimitMonthly
                  ? [ts('page.limit'), `${qty(svc.usageLimitMonthly)} ${unit}`]
                  : null,
                svc.autoPay ? [ts('page.autoPay'), ts('page.autoPayOn')] : null,
              ]}
            />
            {svc.notes && <p className="muted small mt-3 whitespace-pre-wrap">{svc.notes}</p>}
            <div className="mt-3 flex items-center gap-3">
              <Disc icon={svc.type.icon} colour={svc.colour} size="sm" />
              <span className="muted small">{svc.type.label}</span>
            </div>
          </Card>

          {sub && (
            <Card className={svc.cancelledAt ? undefined : 'danger'}>
              <SectionHead title={ts(svc.cancelledAt ? 'cancel.resumeTitle' : 'cancel.title')} />
              <p className="muted small">
                {ts(svc.cancelledAt ? 'cancel.resumeBody' : 'cancel.body', { name: svc.name })}
              </p>
              <div className="mt-3">
                {svc.cancelledAt ? (
                  <InlineAction
                    action={resumeServiceAction}
                    hidden={{ id: svc.id }}
                    label={ts('cancel.resume')}
                    variant="secondary"
                  />
                ) : (
                  <InlineAction
                    action={cancelServiceAction}
                    hidden={{ id: svc.id }}
                    label={ts('cancel.button', { name: svc.name })}
                    variant="danger"
                    confirm={ts('cancel.confirm', { name: svc.name })}
                  />
                )}
              </div>
            </Card>
          )}
        </aside>
      </div>
    </div>
  );
}
