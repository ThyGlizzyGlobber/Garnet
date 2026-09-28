import Link from 'next/link';
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

/** A service at a glance: how much it uses and how that compares, then its bills. */
export default async function ServicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { hh, money, date } = await pageContext();
  const t = await getTranslations('usage');
  const ts = await getTranslations('services');
  const svc = getService(hh.id, id);
  if (!svc) notFound();
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

  // Per-band change against the previous bill with usage.
  const before = c?.previous?.period.parts ?? [];

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title={svc.name}
        subtitle={`${svc.provider} · ${svc.type.label}`}
        action={
          <LinkButton href={`/services/${svc.id}/edit`} variant="secondary">
            {ts('edit')}
          </LinkButton>
        }
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
      </Card>

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
