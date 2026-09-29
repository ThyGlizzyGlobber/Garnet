import Link from 'next/link';
import { visibleTo } from '@/lib/scope';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { ChangeText, formatQty } from '@/components/app/usage';
import { TrendLine } from '@/components/charts/trend-line';
import { Badge, Card, LinkButton, PageHeader } from '@/components/ui';
import { listBills } from '@/lib/bills';
import { compareUsage, DAYS_PER_MONTH, usageHistory, type Change } from '@/lib/consumption';
import { pageContext } from '@/lib/context';
import { getService } from '@/lib/services';
import { unitLabel } from '@/lib/units';
import { SeasonAhead } from '@/components/app/season-ahead';
import { monthLabel } from '@/lib/bill-month';
import { addMonths } from '@/lib/periods';
import { projectMonth } from '@/lib/projections';
import { seasonAhead } from '@/lib/seasons';
import { weatherAdjusted } from '@/lib/weather-model';
import { areaComparison } from '@/lib/regional';
import { splitView } from '@/lib/split-view';
import { partText } from '../split-text';

/** A service at a glance: how much it uses and how that compares, then its bills. */
export default async function ServicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { hh, me, money, date, today } = await pageContext();
  const t = await getTranslations('usage');
  const ts = await getTranslations('services');
  const svc = getService(hh.id, id);
  // Another member's personal service doesn't exist, as far as anyone else can tell.
  if (!svc || !visibleTo(svc.ownerMemberId, me.id)) notFound();
  const history = usageHistory(hh.id, svc.id);
  const c = compareUsage(hh.id, svc.id);
  const unit = unitLabel(c?.unit ?? svc.usageUnit);
  const qty = (n: number) => formatQty(n, hh.locale);
  const words = (pct: number) => ({
    more: t('more', { pct }),
    less: t('less', { pct }),
    same: t('same'),
  });
  const bills = listBills(hh.id, { serviceId: svc.id }).slice(0, 6);
  const withUsage = (history?.periods ?? []).filter((p) => p.perDay !== null);

  const rows: { label: string; usage: Change; cost?: Change }[] = [];
  if (c?.previous)
    rows.push({ label: t('vs.previous'), usage: c.previous.usage, cost: c.previous.cost });
  if (c?.lastYear)
    rows.push({ label: t('vs.lastYear'), usage: c.lastYear.usage, cost: c.lastYear.cost });
  if (c?.average)
    rows.push({
      label: t('vs.average', { count: c.average.bills }),
      usage: c.average.usage,
      cost: c.average.cost,
    });
  if (c?.limit)
    rows.push({ label: t('vs.limit', { qty: qty(c.limit.monthly), unit }), usage: c.limit.usage });
  if (c?.similarHouseholds) rows.push({ label: t('vs.similar'), usage: c.similarHouseholds });

  const seasons = seasonAhead(hh.id, today).filter((n) => n.serviceId === svc.id);
  // "Households like yours" (scope S4): only for households that share.
  const ta = await getTranslations('area');
  const area = areaComparison(hh.id, svc.id, today);
  const perUnit = (v: number, unit: string) => {
    const [currency, per] = unit.split('/');
    const price = new Intl.NumberFormat(hh.locale, {
      style: 'currency',
      currency: currency || hh.currency,
      maximumFractionDigits: 3,
    }).format(v);
    return `${price}/${unitLabel(per)}`;
  };
  // "Against the same time last year: you used 12% more; it was 18% colder.
  // Adjusted for the weather, 5% less." Only when the weather model qualifies.
  const tw = await getTranslations('weather.adjusted');
  const adj = svc.seasonal ? weatherAdjusted(hh.id, svc.id) : null;
  const pctOf = (x: number) => Math.round(Math.abs(x) * 100);
  const weatherLine = adj
    ? [
        `${tw(adj.against)}: ${tw(`${adj.measure}${adj.actual >= 0 ? 'More' : 'Less'}`, { pct: pctOf(adj.actual) })}${
          adj.weather ? `; ${tw(adj.weather.kind, { pct: pctOf(adj.weather.pct) })}` : ''
        }.`,
        Math.abs(adj.adjusted) < 0.02
          ? tw('adjustedSame')
          : tw(adj.adjusted > 0 ? 'adjustedMore' : 'adjustedLess', { pct: pctOf(adj.adjusted) }),
        tw('explains', { pct: pctOf(adj.r2) }),
      ].join(' ')
    : null;
  // The next three months' estimates, and what each is based on.
  const comingUp = [0, 1, 2]
    .map((i) => addMonths(today.slice(0, 7), i))
    .map((month) => ({
      month,
      p: projectMonth(hh.id, month).services.find((x) => x.service.id === svc.id),
    }))
    .filter((x) => x.p && x.p.method !== 'none');

  // Who pays what of it (household services, in households that split bills).
  const tsp = await getTranslations('services.split');
  const split = hh.splitMode === 'shared' && !svc.ownerMemberId ? splitView(hh.id, svc) : null;
  const payer = split?.parts.find((p) => p.member.id === svc.payerMemberId)?.member;

  // Per-band change against the previous bill with usage.
  const before = c?.previous?.period.parts ?? [];

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
        notices={seasons}
        locale={hh.locale}
        money={money}
        linkToService={false}
        className="mb-4"
      />

      <Card>
        <h2 className="font-semibold">{t('title')}</h2>
        {c ? (
          <>
            <p className="mt-2 font-display text-[34px] leading-none font-semibold tracking-tight tabular-nums">
              {t('perDay', { qty: qty(c.latest.perDay!), unit })}
            </p>
            <p className="mt-1 text-sm text-fg-muted">
              {t('perMonth', { qty: qty(c.latest.perDay! * DAYS_PER_MONTH), unit })}
            </p>
            <p className="mt-0.5 text-xs text-fg-muted">
              {t('latest', {
                start: date(c.latest.periodStart, 'short'),
                end: date(c.latest.periodEnd, 'short'),
                cost: money(Math.round(c.latest.costPerDayMinor), c.latest.currency),
              })}
            </p>
            {rows.length > 0 && (
              <dl className="mt-4 divide-y divide-border text-sm">
                {rows.map((r) => (
                  <div key={r.label} className="flex items-baseline justify-between gap-4 py-2">
                    <dt className="text-fg-muted">{r.label}</dt>
                    <dd className="text-right">
                      <ChangeText change={r.usage} words={words} className="font-semibold" />
                      {r.cost && r.cost.pct !== null && (
                        <span className="block text-xs text-fg-muted">
                          {t('costChange', {
                            change:
                              Math.abs(r.cost.pct) < 0.02
                                ? t('same')
                                : r.cost.pct > 0
                                  ? t('more', { pct: Math.round(r.cost.pct * 100) })
                                  : t('less', { pct: Math.round(-r.cost.pct * 100) }),
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
            {me.role === 'owner' && (
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
                      background: p.member.colour,
                    }}
                  />
                ))}
            </div>
          )}
          <ul className="mt-3 flex flex-col gap-2 text-sm">
            {split.parts.map((p) => (
              <li key={p.member.id} className="flex items-center gap-3">
                <span
                  className="size-2.5 shrink-0 rounded-full"
                  style={{ background: p.member.colour }}
                  aria-hidden
                />
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

      {withUsage.length >= 2 && (
        <Card className="mt-4">
          <h2 className="font-semibold">{t('chart')}</h2>
          <div className="mt-2">
            <TrendLine
              id={`usage-${svc.id}`}
              colour={svc.colour}
              height={200}
              label={t('chartLabel')}
              points={withUsage.map((p) => ({
                key: p.billId,
                label: date(p.periodEnd, 'short'),
                value: Math.round(p.perDay! * 10) / 10,
                text: `${qty(p.perDay!)} ${unit}`,
              }))}
            />
          </div>
        </Card>
      )}

      {c && c.latest.parts.length > 0 && (
        <Card className="mt-4">
          <h2 className="font-semibold">{t('bands')}</h2>
          <p className="mt-0.5 text-xs text-fg-muted">{t('bandsHint')}</p>
          <dl className="mt-2 divide-y divide-border text-sm">
            {c.latest.parts.map((p) => {
              const was = before.find((b) => b.key === p.key);
              return (
                <div key={p.key} className="flex items-baseline justify-between gap-4 py-2">
                  <dt>{p.label}</dt>
                  <dd className="text-right tabular-nums">
                    <span className="font-medium">{t('perDay', { qty: qty(p.perDay), unit })}</span>
                    {was && (
                      <ChangeText
                        className="block text-xs"
                        words={words}
                        change={{
                          from: was.perDay,
                          to: p.perDay,
                          pct: was.perDay ? (p.perDay - was.perDay) / was.perDay : null,
                        }}
                      />
                    )}
                  </dd>
                </div>
              );
            })}
          </dl>
        </Card>
      )}

      {area && (
        <Card className="mt-4">
          <h2 className="font-semibold">{ta('title')}</h2>
          <p className="mt-0.5 text-xs text-fg-muted">
            {ta(area.sameSize ? 'basisSameSize' : 'basis', {
              month: monthLabel(area.month, hh.locale),
              households: area.cost?.households ?? 0,
              area: area.areaName,
            })}
          </p>
          <dl className="mt-2 divide-y divide-border text-sm">
            {(
              [
                ['cost', area.cost, (v: number) => money(Math.round(v))],
                ['usage', area.usage, (v: number) => `${qty(v)} ${unitLabel(area.usage?.unit)}`],
                ['rate', area.rate, (v: number) => perUnit(v, area.rate?.unit ?? '')],
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

      {comingUp.length > 0 && (
        <Card className="mt-4">
          <h2 className="font-semibold">{t('comingUp.title')}</h2>
          <dl className="mt-2 divide-y divide-border text-sm">
            {comingUp.map(({ month, p }) => (
              <div key={month} className="flex items-baseline justify-between gap-4 py-2">
                <dt>
                  {monthLabel(month, hh.locale)}
                  <span className="block text-xs text-fg-muted">
                    {t(`comingUp.${p!.method}`, {
                      month: new Intl.DateTimeFormat(hh.locale, {
                        month: 'long',
                        timeZone: 'UTC',
                      }).format(new Date(`${month}-01T00:00:00Z`)),
                    })}
                  </span>
                </dt>
                <dd className="font-semibold tabular-nums">{money(p!.monthMinor)}</dd>
              </div>
            ))}
          </dl>
        </Card>
      )}

      {bills.length > 0 && (
        <Card className="mt-4">
          <h2 className="font-semibold">{t('bills')}</h2>
          <ul className="mt-2 divide-y divide-border text-sm">
            {bills.map((b) => (
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
                    {b.isAnomaly && <Badge tone="warning">!</Badge>}
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
