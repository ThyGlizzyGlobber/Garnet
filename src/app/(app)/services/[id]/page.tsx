import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { SeasonAhead } from '@/components/app/season-ahead';
import { ChangeText } from '@/components/app/usage';
import { TrendLine } from '@/components/charts/trend-line';
import { Badge, Card, Figure, LinkButton, PageHeader } from '@/components/ui';
import { Swatch } from '@/components/ui/colour';
import { SAME_BAND } from '@/lib/averages';
import { DAYS_PER_MONTH } from '@/lib/consumption';
import { pageContext } from '@/lib/context';
import { formatRate } from '@/lib/format';
import { colourCss } from '@/lib/palette';
import { isAdmin } from '@/lib/roles';
import { visibleTo } from '@/lib/scope';
import { serviceOverview } from '@/lib/service-overview';
import { getService } from '@/lib/services';
import { unitLabel } from '@/lib/units';
import { partText } from '../split-text';

/**
 * A service at a glance: how much it uses and how that compares, then how
 * it's split, its area, what's coming up and its bills. Numbers come from
 * serviceOverview() (src/lib/service-overview.ts).
 */
export default async function ServicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { hh, me, money, date, month, qty, today } = await pageContext();
  const t = await getTranslations('usage');
  const ts = await getTranslations('services');
  const svc = getService(hh.id, id);
  // Another member's personal service doesn't exist, as far as anyone else can tell.
  if (!svc || !visibleTo(svc.ownerMemberId, me.id)) notFound();
  const o = serviceOverview(hh, svc, today);
  const c = o.usage;
  const unit = unitLabel(c?.unit ?? svc.usageUnit);
  const words = (pct: number) => ({
    more: t('more', { pct }),
    less: t('less', { pct }),
    same: t('same'),
  });
  const pctOf = (x: number) => Math.round(Math.abs(x) * 100);
  const againstLabel = (r: (typeof o.comparisons)[number]) =>
    r.against === 'average'
      ? t('vs.average', { count: r.bills ?? 0 })
      : r.against === 'limit'
        ? t('vs.limit', { qty: qty(r.limit ?? 0), unit })
        : t(`vs.${r.against}`);

  // "Against the same time last year: you used 12% more; it was 18% colder.
  // Adjusted for the weather, 5% less." Only when the weather model qualifies.
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

  const ta = await getTranslations('area');
  const area = o.area;
  const tsp = await getTranslations('services.split');
  const split = o.split;
  const payer = split?.parts.find((p) => p.member.id === svc.payerMemberId)?.member;

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title={svc.name}
        subtitle={`${svc.provider} · ${svc.type.label}${svc.ownerMemberId ? ` · ${ts('onlyYou')}` : ''}`}
        action={
          <LinkButton href={`/services/${svc.id}/edit`} variant="secondary">
            {ts('edit')}
          </LinkButton>
        }
      />

      <SeasonAhead
        notices={o.seasons}
        locale={hh.locale}
        money={money}
        linkToService={false}
        className="mb-4"
      />

      <Card>
        <h2 className="font-semibold">{t('title')}</h2>
        {c && c.latest.perDay !== null ? (
          <>
            <Figure size="md" className="mt-2">
              {t('perDay', { qty: qty(c.latest.perDay), unit })}
            </Figure>
            <p className="mt-1 text-sm text-fg-muted">
              {t('perMonth', { qty: qty(c.latest.perDay * DAYS_PER_MONTH), unit })}
            </p>
            <p className="mt-0.5 text-xs text-fg-muted">
              {t('latest', {
                start: date(c.latest.periodStart, 'short'),
                end: date(c.latest.periodEnd, 'short'),
                cost: money(Math.round(c.latest.costPerDayMinor), c.latest.currency),
              })}
            </p>
            {o.comparisons.length > 0 && (
              <dl className="mt-4 divide-y divide-border text-sm">
                {o.comparisons.map((r) => (
                  <div key={r.against} className="flex items-baseline justify-between gap-4 py-2">
                    <dt className="text-fg-muted">{againstLabel(r)}</dt>
                    <dd className="text-right">
                      <ChangeText change={r.usage} words={words} className="font-semibold" />
                      {r.cost && r.cost.pct !== null && (
                        <span className="block text-xs text-fg-muted">
                          {t('costChange', {
                            change:
                              Math.abs(r.cost.pct) < SAME_BAND
                                ? t('same')
                                : r.cost.pct > 0
                                  ? t('more', { pct: pctOf(r.cost.pct) })
                                  : t('less', { pct: pctOf(r.cost.pct) }),
                          })}
                        </span>
                      )}
                    </dd>
                  </div>
                ))}
              </dl>
            )}
          </>
        ) : (
          <p className="mt-1 text-sm text-fg-muted">{t('none')}</p>
        )}
        {weatherLine && (
          <p className="mt-3 rounded-2xl bg-surface-2 px-4 py-3 text-sm">{weatherLine}</p>
        )}
      </Card>

      {split && split.parts.length > 1 && (
        <Card className="mt-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-semibold">{tsp('title')}</h2>
            {isAdmin(me) && (
              <Link
                href={`/services/${svc.id}/edit#split`}
                className="text-sm font-medium text-accent hover:underline"
              >
                {tsp('change')}
              </Link>
            )}
          </div>
          <p className="mt-1 text-sm text-fg-muted">
            {ts(`form.splitModes.${split.mode}`)}
            {payer ? ` · ${ts('paidBy', { name: payer.name })}` : ''}
          </p>
          {split.latestMinor !== null && split.latestMinor > 0 && (
            <div className="mt-3 flex h-2.5 overflow-hidden rounded-full bg-surface-2">
              {split.parts
                .filter((p) => p.exampleMinor)
                .map((p) => (
                  <span
                    key={p.member.id}
                    style={{
                      width: `${(p.exampleMinor! * 100) / split.latestMinor!}%`,
                      background: colourCss(p.member.colour),
                    }}
                  />
                ))}
            </div>
          )}
          <ul className="mt-3 flex flex-col gap-2 text-sm">
            {split.parts.map((p) => (
              <li key={p.member.id} className="flex items-center gap-3">
                <Swatch colour={p.member.colour} dot />
                <span className="min-w-0 flex-1 truncate font-medium">{p.member.name}</span>
                <span className="text-fg-muted">{partText(tsp, p.setting, money)}</span>
                {p.exampleMinor !== null && (
                  <span className="w-24 text-right font-semibold tabular-nums">
                    {money(p.exampleMinor)}
                  </span>
                )}
              </li>
            ))}
          </ul>
          {split.latestMinor !== null && (
            <p className="mt-2 text-xs text-fg-muted">
              {tsp('latest', { amount: money(split.latestMinor) })}
            </p>
          )}
        </Card>
      )}

      {o.trend.length >= 2 && (
        <Card className="mt-4">
          <h2 className="font-semibold">{t('chart')}</h2>
          <div className="mt-2">
            <TrendLine
              id={`usage-${svc.id}`}
              colour={svc.colour}
              height={200}
              label={t('chartLabel')}
              points={o.trend.map((p) => ({
                key: p.billId,
                label: date(p.periodEnd, 'short'),
                value: Math.round(p.perDay * 10) / 10,
                text: `${qty(p.perDay)} ${unit}`,
              }))}
            />
          </div>
        </Card>
      )}

      {o.bands.length > 0 && (
        <Card className="mt-4">
          <h2 className="font-semibold">{t('bands')}</h2>
          <p className="mt-0.5 text-xs text-fg-muted">{t('bandsHint')}</p>
          <dl className="mt-2 divide-y divide-border text-sm">
            {o.bands.map((p) => (
              <div key={p.key} className="flex items-baseline justify-between gap-4 py-2">
                <dt>{p.label}</dt>
                <dd className="text-right tabular-nums">
                  <span className="font-medium">{t('perDay', { qty: qty(p.perDay), unit })}</span>
                  {p.change && (
                    <ChangeText className="block text-xs" words={words} change={p.change} />
                  )}
                </dd>
              </div>
            ))}
          </dl>
        </Card>
      )}

      {area && (
        <Card className="mt-4">
          <h2 className="font-semibold">{ta('title')}</h2>
          <p className="mt-0.5 text-xs text-fg-muted">
            {ta(area.sameSize ? 'basisSameSize' : 'basis', {
              month: month(area.month, 'long-year'),
              households: area.cost?.households ?? 0,
              area: area.areaName,
            })}
          </p>
          <dl className="mt-2 divide-y divide-border text-sm">
            {(
              [
                ['cost', area.cost, (v: number) => money(Math.round(v))],
                ['usage', area.usage, (v: number) => `${qty(v)} ${unitLabel(area.usage?.unit)}`],
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
                <div key={key} className="flex items-baseline justify-between gap-4 py-2">
                  <dt>
                    {ta(`metric.${key}`)}
                    <span className="block text-xs text-fg-muted">
                      {ta('range', { low: show(f!.p25), high: show(f!.p75) })}
                    </span>
                  </dt>
                  <dd className="text-right tabular-nums">
                    <span className="font-semibold">
                      {ta('typical', { value: show(f!.median) })}
                    </span>
                    {f!.you !== null && (
                      <span className="block text-xs">
                        {ta('you', { value: show(f!.you) })}{' '}
                        <ChangeText
                          change={{
                            from: f!.median,
                            to: f!.you,
                            pct: f!.median ? (f!.you - f!.median) / f!.median : null,
                          }}
                          words={words}
                        />
                      </span>
                    )}
                  </dd>
                </div>
              ))}
          </dl>
        </Card>
      )}

      {o.comingUp.length > 0 && (
        <Card className="mt-4">
          <h2 className="font-semibold">{t('comingUp.title')}</h2>
          <dl className="mt-2 divide-y divide-border text-sm">
            {o.comingUp.map((u) => (
              <div key={u.month} className="flex items-baseline justify-between gap-4 py-2">
                <dt>
                  {month(u.month, 'long-year')}
                  <span className="block text-xs text-fg-muted">
                    {t(`comingUp.${u.method}`, { month: month(u.month) })}
                  </span>
                </dt>
                <dd className="font-semibold tabular-nums">{money(u.minor)}</dd>
              </div>
            ))}
          </dl>
        </Card>
      )}

      {o.bills.length > 0 && (
        <Card className="mt-4">
          <h2 className="font-semibold">{t('bills')}</h2>
          <ul className="mt-2 divide-y divide-border text-sm">
            {o.bills.map((b) => (
              <li key={b.id}>
                <Link
                  href={`/bills/${b.id}`}
                  className="flex items-center justify-between gap-4 py-2 hover:text-accent"
                >
                  <span>
                    {date(b.periodStart, 'short')} – {date(b.periodEnd, 'short')}
                    {b.usageQuantity !== null && (
                      <span className="ml-2 text-xs text-fg-muted">
                        {qty(b.usageQuantity)} {unitLabel(b.usageUnit)}
                      </span>
                    )}
                  </span>
                  <span className="flex items-center gap-2">
                    {b.isAnomaly && <Badge tone="warning">{ts('unusual')}</Badge>}
                    <span className="font-semibold tabular-nums">
                      {money(b.amountMinor, b.currency)}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
