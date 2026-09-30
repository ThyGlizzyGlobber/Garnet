import Link from 'next/link';
import type { ReactNode } from 'react';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { billRowFor, rowCtx } from '@/components/app/bill-rows';
import { Card, LinkButton } from '@/components/ui';
import { Kv, PageTitle, SectionHead } from '@/components/ui/blocks';
import { Chip } from '@/components/ui/chip';
import { BackLink } from '@/components/ui/controls';
import { BillRow, Rows } from '@/components/ui/rows';
import type { BillListItem } from '@/lib/bills';
import { pageContext } from '@/lib/context';
import { getMember } from '@/lib/members';
import { vehicleView } from '@/lib/main-view';
import { BreakdownCard, MonthsCard, NumsCard, YearAheadCard } from '../../overview';
import { kindNamer } from '../../vehicles-page';

/**
 * One vehicle, laid out like a service's page: what it costs and what's
 * coming (the year ahead by kind, each month's bills), every bill by year,
 * and beside them its figures, where the money goes by kind, and who each
 * kind is with. Numbers from vehicleView().
 */
export default async function VehiclePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ filed?: string }>;
}) {
  const { id } = await params;
  const filed = Number((await searchParams).filed) || 0;
  const ctx = await pageContext();
  const { hh, me, money } = ctx;
  const v = vehicleView(hh, me, id, ctx.today);
  if (!v) notFound();
  const t = await getTranslations('main');
  const tv = await getTranslations('main.vehicle');
  const to = await getTranslations('main.overview');
  const rc = rowCtx(ctx, await getTranslations('ui'));
  const kindName = await kindNamer();
  const whole = (minor: number) => money(minor, hh.currency, { whole: true });
  const o = v.overview;
  const a = v.asset;
  const addedBy = a.createdByMemberId ? getMember(hh.id, a.createdByMemberId) : null;

  // Every bill by the year its period starts, newest first; each reads as its kind.
  const years = new Map<string, BillListItem[]>();
  for (const b of v.bills) {
    const y = b.periodStart.slice(0, 4);
    years.set(y, [...(years.get(y) ?? []), b]);
  }

  return (
    <div className="scr d3-service">
      <BackLink href="/services/category/vehicle">{t('main.vehicle')}</BackLink>
      <PageTitle
        eyebrow={[tv('label'), a.identifier].filter(Boolean).join(' · ')}
        title={a.name}
        lede={
          v.kinds.length
            ? `${tv('with', {
                list: new Intl.ListFormat(hh.locale, { type: 'conjunction' }).format(
                  v.kinds.map((k) =>
                    tv('kindWith', {
                      kind: kindName(k.type.slug, k.type.label),
                      provider: k.providers.join(' / '),
                    }),
                  ),
                ),
              })} ${tv('costs', { amount: whole(o.yearMinor), ahead: whole(o.aheadMinor) })}`
            : tv('noBillsLede')
        }
        lead
        chips={
          <>
            <Chip
              tone={a.ownerMemberId ? 'info' : 'neutral'}
              icon={a.ownerMemberId ? 'user' : 'users'}
            >
              {a.ownerMemberId === me.id ? t('yours') : tv('household')}
            </Chip>
            {a.identifier && (
              <Chip tone="neutral">
                <span className="mono">{a.identifier}</span>
              </Chip>
            )}
          </>
        }
        right={
          v.canEdit && (
            <LinkButton
              href={`/services/vehicles/${a.id}/edit`}
              variant="secondary"
              size="sm"
              icon="pencil"
            >
              {tv('edit')}
            </LinkButton>
          )
        }
      />
      {filed > 0 && (
        <Card className="bg-accent-soft">
          <p className="small">{tv('filed', { count: filed })}</p>
        </Card>
      )}
      <div className="d3-cols">
        <div className="d3-main">
          <YearAheadCard ctx={ctx} overview={o} seriesName={kindName} rowName={kindName} />
          <MonthsCard ctx={ctx} overview={o} seriesName={kindName} />
          <Card className="d3-every" id="bills">
            <SectionHead
              title={tv('everyBill')}
              right={<span className="muted">{t('billCount', { count: v.bills.length })}</span>}
            />
            {v.bills.length === 0 ? (
              <p className="muted">{tv('noBillsBody')}</p>
            ) : (
              <div className="d3-tl">
                {[...years].map(([year, bills]) => (
                  <div key={year} className="year-group">
                    <div className="year-h">
                      <span>{year}</span>
                      <span className="muted">
                        {t('billCount', { count: bills.length })} ·{' '}
                        {whole(bills.reduce((s, b) => s + b.amountMinor, 0))}
                      </span>
                    </div>
                    <Rows>
                      {bills.map((b) => {
                        const r = billRowFor(b, rc, {
                          share: true,
                          noDisc: true,
                          noAsset: true,
                          noYours: true,
                        });
                        return (
                          <BillRow
                            key={b.id}
                            bill={{
                              ...r,
                              title: kindName(b.service.typeSlug, b.service.type.label),
                            }}
                          />
                        );
                      })}
                    </Rows>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        <aside className="d3-aside">
          <NumsCard
            ctx={ctx}
            overview={o}
            seriesName={kindName}
            fourth={{
              label: tv('kindsLabel'),
              value: String(v.kinds.length),
              sub: v.kinds.map((k) => kindName(k.type.slug, k.type.label)).join(', ') || '—',
            }}
          />
          <BreakdownCard
            ctx={ctx}
            title={to('byKind')}
            parts={o.bySeries.map((s) => ({ ...s, label: kindName(s.key, s.label) }))}
          />
          <Card>
            <SectionHead title={tv('detailsTitle')} />
            <Kv
              rows={[
                [
                  tv('identifier'),
                  a.identifier ? (
                    <span key="i" className="mono">
                      {a.identifier}
                    </span>
                  ) : (
                    '—'
                  ),
                ],
                [tv('whoseLabel'), a.ownerMemberId === me.id ? t('yours') : tv('household')],
                addedBy ? [tv('addedBy'), addedBy.id === me.id ? tv('you') : addedBy.name] : null,
                ...v.kinds.map((k): [string, ReactNode] => [
                  kindName(k.type.slug, k.type.label),
                  <Link
                    key={k.type.slug}
                    href={`/services/${k.latest.service.id}`}
                    className="link"
                  >
                    {k.providers.join(' / ')}
                  </Link>,
                ]),
              ]}
            />
            <p className="muted small mt-3">{tv('detailsNote')}</p>
          </Card>
        </aside>
      </div>
    </div>
  );
}
