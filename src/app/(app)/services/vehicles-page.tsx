import { getTranslations } from 'next-intl/server';
import { billRowFor, rowCtx, statusLabel } from '@/components/app/bill-rows';
import { CardLink, MainCard } from '@/components/app/main-card';
import { FilterChip, LinkButton } from '@/components/ui';
import { EmptyCard, Notice, PageTitle } from '@/components/ui/blocks';
import { BackLink } from '@/components/ui/controls';
import { BillRow, Rows } from '@/components/ui/rows';
import type { BillListItem } from '@/lib/bills';
import { billDue } from '@/lib/bill-status';
import type { PageContext } from '@/lib/context';
import type { VehiclesView } from '@/lib/main-view';
import { fileBillAction } from './asset-actions';
import { FileBillForm } from './asset-form';
import { OverviewLayout } from './overview';

/**
 * Vehicles: a card per vehicle, opening to all its bills (each labelled Rego,
 * Insurance, Roadside or Servicing), chips to show one kind, the bills not
 * filed under a vehicle yet, and "Add a vehicle" top right. Numbers from
 * vehiclesView().
 */
export async function VehiclesPage({
  ctx,
  view,
  open,
}: {
  ctx: PageContext;
  view: VehiclesView;
  /** The vehicle card to open (an asset id). */
  open: string | null;
}) {
  const { hh, money, me } = ctx;
  const t = await getTranslations('main');
  const tv = await getTranslations('main.vehicle');
  const rc = rowCtx(ctx, await getTranslations('ui'));
  const kindLabel = (slug: string, label: string) =>
    t.has(`kinds.${slug}` as never) ? t(`kinds.${slug}` as never) : label;
  const here = (kind: string | null) =>
    kind ? `/services/category/vehicle?kind=${kind}` : '/services/category/vehicle';
  // Inside a vehicle's card a bill reads as its kind ("Rego") and its business.
  const row = (b: BillListItem) => {
    const r = billRowFor(b, rc, { share: true, noDisc: true, noAsset: true, noYours: true });
    return (
      <BillRow
        key={b.id}
        bill={{ ...r, title: kindLabel(b.service.typeSlug, b.service.type.label) }}
      />
    );
  };
  // With one kind picked, only the vehicles with a bill of it.
  const cards = view.kind ? view.cards.filter((c) => c.bills.length > 0) : view.cards;
  const only = cards.length === 1 && view.waiting.length === 0;

  return (
    <div className="scr d3-main-svc">
      <BackLink href="/services">{t('services')}</BackLink>
      <PageTitle
        eyebrow={t('services')}
        title={t('main.vehicle')}
        lede={
          view.cards.length || view.waiting.length
            ? tv('lede', {
                count: view.cards.length,
                amount: money(view.yearMinor, hh.currency, { whole: true }),
              })
            : undefined
        }
        right={
          <LinkButton href="/services/vehicles/new" size="sm" icon="plus">
            {tv('add')}
          </LinkButton>
        }
      />

      {view.kinds.length > 1 && (
        <div className="filters">
          <FilterChip href={here(null)} active={!view.kind}>
            {tv('allKinds')}
          </FilterChip>
          {view.kinds.map((k) => (
            <FilterChip
              key={k.type.slug}
              href={here(k.type.slug)}
              active={view.kind === k.type.slug}
            >
              {kindLabel(k.type.slug, k.type.label)}
              <span className="muted"> {k.bills}</span>
            </FilterChip>
          ))}
        </div>
      )}
      {view.cards.length === 0 && view.waiting.length === 0 ? (
        <EmptyCard icon="car" title={tv('emptyTitle')} body={tv('emptyBody')}>
          <LinkButton href="/services/vehicles/new" icon="plus">
            {tv('add')}
          </LinkButton>
        </EmptyCard>
      ) : (
        <OverviewLayout
          ctx={ctx}
          overview={view.overview}
          kind="vehicle"
          count={view.cards.length}
          countSub={
            view.waiting.length
              ? tv('waitingCount', { count: view.waiting.length })
              : tv('allFiled')
          }
          seriesName={kindLabel}
          asideTop={
            view.waiting.length > 0 && (
              <Notice
                tone="warn"
                icon="alert"
                title={tv('waitingCount', { count: view.waiting.length })}
                body={view.cards.length ? tv('waitingBody') : tv('waitingBodyEmpty')}
                href="#waiting"
              />
            )
          }
        >
          <div className="mcards">
            {cards.map((c) => {
              const latest = c.bills[0];
              const due = latest ? billDue(latest, ctx.today) : null;
              return (
                <MainCard
                  key={c.asset.id}
                  id={`v-${c.asset.id}`}
                  open={open === c.asset.id || only}
                  icon="car"
                  colour={view.kinds[0]?.type.colour ?? '#e87ba4'}
                  title={c.asset.name}
                  meta={
                    <>
                      {c.asset.identifier && <span className="mono">{c.asset.identifier}</span>}
                      {c.asset.identifier ? ' · ' : ''}
                      {[
                        c.asset.ownerMemberId === me.id ? t('yours') : null,
                        t('billCount', { count: c.bills.length }),
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </>
                  }
                  amount={due ? money(due.amountMinor, latest!.currency) : undefined}
                  status={
                    due ? { label: statusLabel(rc, due.status), tone: due.status.tone } : undefined
                  }
                  year={t('year', { amount: money(c.yearMinor, hh.currency, { whole: true }) })}
                  footer={
                    c.canEdit && (
                      <CardLink href={`/services/vehicles/${c.asset.id}`}>{tv('edit')}</CardLink>
                    )
                  }
                >
                  {c.bills.length ? (
                    <Rows>{c.bills.map(row)}</Rows>
                  ) : (
                    <p className="muted small mcard-empty">{t('noBills')}</p>
                  )}
                </MainCard>
              );
            })}
            {view.kind && cards.length === 0 && view.waiting.length === 0 && (
              <p className="muted">{tv('noneOfKind')}</p>
            )}
            {view.waiting.length > 0 && (
              <MainCard
                id="waiting"
                open
                icon="alert"
                colour="#eda100"
                title={tv('waitingTitle')}
                meta={view.cards.length ? tv('waitingBody') : tv('waitingBodyEmpty')}
                flag={{ label: t('billCount', { count: view.waiting.length }), tone: 'warn' }}
              >
                {view.waiting.map((b) => (
                  <div key={b.id} className="mcard-wait">
                    <Rows>{row(b)}</Rows>
                    {view.cards.length > 0 && (
                      <FileBillForm
                        action={fileBillAction}
                        billId={b.id}
                        assets={view.cards.map((c) => ({
                          id: c.asset.id,
                          name: c.asset.ownerMemberId
                            ? `${c.asset.name} · ${t('yours')}`
                            : c.asset.name,
                        }))}
                        back={here(view.kind)}
                      />
                    )}
                  </div>
                ))}
              </MainCard>
            )}
          </div>
        </OverviewLayout>
      )}
    </div>
  );
}
