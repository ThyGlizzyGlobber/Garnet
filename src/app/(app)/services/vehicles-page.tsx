import { getTranslations } from 'next-intl/server';
import { billRowFor, rowCtx } from '@/components/app/bill-rows';
import { MainCard } from '@/components/app/main-card';
import { StackBar } from '@/components/charts/stack-bar';
import { LinkButton } from '@/components/ui';
import { EmptyCard, Notice, PageTitle, SectionHead } from '@/components/ui/blocks';
import { Swatch } from '@/components/ui/colour';
import { BackLink } from '@/components/ui/controls';
import { BillRow, Rows } from '@/components/ui/rows';
import type { BillListItem } from '@/lib/bills';
import type { PageContext } from '@/lib/context';
import type { VehiclesView } from '@/lib/main-view';
import { fileBillAction } from './asset-actions';
import { FileBillForm } from './asset-form';
import { BreakdownCard, NextLine, NumsCard, YearAheadCard } from './overview';
import { SummaryTile } from '@/components/app/summary-tile';

/** "Rego" for Vehicle registration: the short names vehicle bills go by. */
export async function kindNamer() {
  const t = await getTranslations('main');
  return (slug: string, label: string) =>
    t.has(`kinds.${slug}` as never) ? t(`kinds.${slug}` as never) : label;
}

/**
 * Vehicles: all of them together first (the four figures and where the
 * money goes, by kind), then a tile per vehicle opening its own page, the
 * year ahead for all of them, where the money goes by vehicle, and the bills
 * waiting for a vehicle. Numbers from vehiclesView().
 */
export async function VehiclesPage({ ctx, view }: { ctx: PageContext; view: VehiclesView }) {
  const { hh, money, me } = ctx;
  const t = await getTranslations('main');
  const tv = await getTranslations('main.vehicle');
  const to = await getTranslations('main.overview');
  const rc = rowCtx(ctx, await getTranslations('ui'));
  const kindName = await kindNamer();
  const whole = (minor: number) => money(minor, hh.currency, { whole: true });
  const o = view.overview;
  // A waiting bill reads as its kind ("Rego") and its business.
  const row = (b: BillListItem) => {
    const r = billRowFor(b, rc, { share: true, noDisc: true, noAsset: true });
    return (
      <BillRow
        key={b.id}
        bill={{ ...r, title: kindName(b.service.typeSlug, b.service.type.label) }}
      />
    );
  };

  return (
    <div className="scr d3-main-svc">
      <BackLink href="/services">{t('services')}</BackLink>
      <PageTitle
        eyebrow={t('services')}
        title={t('main.vehicle')}
        lede={
          view.cards.length
            ? tv('lede', { count: view.cards.length, amount: whole(o.yearMinor) })
            : undefined
        }
        right={
          <LinkButton href="/services/vehicles/new" size="sm" icon="plus">
            {tv('add')}
          </LinkButton>
        }
      />

      {view.cards.length === 0 && view.waiting.length === 0 ? (
        <EmptyCard icon="car" title={tv('emptyTitle')} body={tv('emptyBody')}>
          <LinkButton href="/services/vehicles/new" icon="plus">
            {tv('add')}
          </LinkButton>
        </EmptyCard>
      ) : (
        <>
          {/* Your vehicles first, each opening its own page. */}
          <SectionHead title={tv('each')} />
          <div className="vx-grid">
            {view.cards.map((c) => {
              const v = c.overview;
              return (
                <SummaryTile
                  key={c.asset.id}
                  href={`/services/vehicles/${c.asset.id}`}
                  icon="car"
                  colour={o.series[0]?.colour ?? '#e87ba4'}
                  title={c.asset.name}
                  meta={
                    <>
                      {c.asset.identifier && <span className="mono">{c.asset.identifier}</span>}
                      {c.asset.identifier ? ' · ' : ''}
                      {c.asset.ownerMemberId === me.id ? t('yours') : tv('household')}
                    </>
                  }
                  figure={whole(v.yearMinor)}
                  figureSub={tv('tileYear', { amount: whole(v.perMonthMinor) })}
                  mix={
                    v.bySeries.length > 0 ? (
                      <span className="vx-mix">
                        <StackBar
                          thin
                          parts={v.bySeries.map((s) => ({
                            value: s.minor,
                            colour: s.colour,
                            label: kindName(s.key, s.label),
                            text: money(s.minor),
                            tip: `${kindName(s.key, s.label)} · ${money(s.minor)}`,
                          }))}
                        />
                        <span className="vx-kinds">
                          {v.bySeries.map((s) => (
                            <span key={s.key}>
                              <Swatch colour={s.colour} />
                              {kindName(s.key, s.label)} {whole(s.minor)}
                            </span>
                          ))}
                        </span>
                      </span>
                    ) : (
                      <span className="muted small">{t('noBills')}</span>
                    )
                  }
                  next={<NextLine ctx={ctx} next={v.next} name={kindName} />}
                />
              );
            })}
          </div>

          {view.waiting.length > 0 && (
            <Notice
              tone="warn"
              icon="alert"
              title={tv('waitingCount', { count: view.waiting.length })}
              body={view.cards.length ? tv('waitingBody') : tv('waitingBodyEmpty')}
              href="#waiting"
            />
          )}

          {/* Then all of them together. */}
          <SectionHead title={tv('together')} className="mt-2" />
          <div className="vx-top">
            <NumsCard
              ctx={ctx}
              overview={o}
              seriesName={kindName}
              className="vx-nums"
              fourth={{
                label: to('vehicles'),
                value: String(view.cards.length),
                sub: view.waiting.length
                  ? tv('waitingCount', { count: view.waiting.length })
                  : tv('allFiled'),
              }}
            />
            <BreakdownCard
              ctx={ctx}
              title={to('byKind')}
              parts={o.bySeries.map((s) => ({ ...s, label: kindName(s.key, s.label) }))}
            />
          </div>

          {view.cards.length > 0 && <YearAheadCard ctx={ctx} overview={o} seriesName={kindName} />}

          {view.cards.length > 1 && (
            <BreakdownCard ctx={ctx} title={to('byVehicle')} parts={o.byRow} />
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
                        name:
                          c.asset.ownerMemberId === me.id
                            ? `${c.asset.name} · ${t('yours')}`
                            : c.asset.name,
                      }))}
                      back="/services/category/vehicle"
                    />
                  )}
                </div>
              ))}
            </MainCard>
          )}
        </>
      )}
    </div>
  );
}
