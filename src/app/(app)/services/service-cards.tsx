import { getTranslations } from 'next-intl/server';
import { rowCtx, statusLabel } from '@/components/app/bill-rows';
import { SummaryTile } from '@/components/app/summary-tile';
import { StackBar } from '@/components/charts/stack-bar';
import { Card, LinkButton } from '@/components/ui';
import { EmptyCard, Notice, PageTitle, SectionHead } from '@/components/ui/blocks';
import { Chip, StatusChip } from '@/components/ui/chip';
import { Swatch } from '@/components/ui/colour';
import { BackLink } from '@/components/ui/controls';
import type { PageContext } from '@/lib/context';
import type {
  ServiceCard,
  ServiceCardsView,
  SubscriptionLine,
  SubscriptionsView,
} from '@/lib/main-view';
import { BreakdownCard, MonthsCard, NextLine, NumsCard, YearAheadCard } from './overview';

/**
 * Health and Lifestyle, built like Vehicles: a tile per service first (its
 * last twelve months and what's next; the tile opens its own page), then
 * all of them together. Numbers from serviceCardsView().
 */
export async function ServiceTilesPage({
  ctx,
  view,
  title,
  addHref,
  addLabel,
  empty,
}: {
  ctx: PageContext;
  view: ServiceCardsView;
  title: string;
  addHref: string;
  addLabel: string;
  empty: { icon: string; title: string; body: string };
}) {
  const { hh, money, me } = ctx;
  const t = await getTranslations('main');
  const to = await getTranslations('main.overview');
  const whole = (minor: number) => money(minor, hh.currency, { whole: true });
  const o = view.overview;
  const name = (_: string, label: string) => label;
  const count = view.cards.length + view.stopped.length;

  const tile = (c: ServiceCard) => {
    const svc = c.service;
    const stopped = !svc.isActive || !!svc.cancelledAt;
    return (
      <SummaryTile
        key={svc.id}
        href={`/services/${svc.id}`}
        icon={svc.type.icon}
        colour={c.colour}
        title={svc.name}
        meta={[
          svc.provider !== svc.name ? svc.provider : null,
          svc.ownerMemberId === me.id ? t('yours') : null,
          stopped ? (svc.cancelledAt ? t('cancelled') : t('stopped')) : null,
        ]
          .filter(Boolean)
          .join(' · ')}
        figure={c.overview.yearBills ? whole(c.overview.yearMinor) : '—'}
        figureSub={
          c.overview.yearBills
            ? t('tileYear', { amount: whole(c.overview.perMonthMinor) })
            : t('tileNoBills')
        }
        next={<NextLine ctx={ctx} next={c.overview.next} name={null} />}
        muted={stopped}
      />
    );
  };

  return (
    <div className="scr d3-main-svc">
      <BackLink href="/services">{t('services')}</BackLink>
      <PageTitle
        eyebrow={t('services')}
        title={title}
        lede={
          count
            ? t('lede', {
                count: view.cards.length,
                stopped: view.stopped.length,
                amount: whole(o.yearMinor),
              })
            : undefined
        }
        right={
          <LinkButton href={addHref} size="sm" icon="plus">
            {addLabel}
          </LinkButton>
        }
      />
      {count === 0 ? (
        <EmptyCard icon={empty.icon} title={empty.title} body={empty.body}>
          <LinkButton href={addHref} icon="plus">
            {addLabel}
          </LinkButton>
        </EmptyCard>
      ) : (
        <>
          {/* Each service first, each opening its own page. */}
          <SectionHead title={t('yourServices')} />
          <div className="vx-grid">{view.cards.map(tile)}</div>
          {view.stopped.length > 0 && (
            <>
              <SectionHead title={t('stoppedHead')} className="mt-2" />
              <div className="vx-grid">{view.stopped.map(tile)}</div>
            </>
          )}

          {/* Then all of them together. */}
          <SectionHead title={t('together')} className="mt-2" />
          <div className="vx-top">
            <NumsCard
              ctx={ctx}
              overview={o}
              seriesName={name}
              className="vx-nums"
              fourth={{
                label: to('services'),
                value: String(view.cards.length),
                sub: view.stopped.length
                  ? t('stoppedCount', { count: view.stopped.length })
                  : t('allGoing'),
              }}
            />
            <BreakdownCard ctx={ctx} title={to('byService')} parts={o.bySeries} />
          </div>
          <YearAheadCard ctx={ctx} overview={o} seriesName={name} />
          <MonthsCard ctx={ctx} overview={o} seriesName={name} />
        </>
      )}
    </div>
  );
}

/**
 * Subscriptions, built like Health and Vehicles: anything charging after it
 * was cancelled first, then a tile per subscription (its price a month, its
 * last twelve months and its next charge; the tile opens its own page), the
 * cancelled ones after, then all of them together: what they cost a month
 * and which take the most, what's coming up, the year ahead and each month.
 * Numbers from subscriptionsView().
 */
export async function SubscriptionsPage({
  ctx,
  view,
  title,
  addHref,
  addLabel,
  empty,
}: {
  ctx: PageContext;
  view: SubscriptionsView;
  title: string;
  addHref: string;
  addLabel: string;
  empty: { icon: string; title: string; body: string };
}) {
  const { hh, money, me } = ctx;
  const t = await getTranslations('main.subs');
  const tm = await getTranslations('main');
  const ts = await getTranslations('services');
  const rc = rowCtx(ctx, await getTranslations('ui'));
  const whole = (minor: number) => money(minor, hh.currency, { whole: true });
  const name = (_: string, label: string) => label;
  const count = view.going.length + view.cancelled.length;

  const tile = (l: SubscriptionLine) => {
    const svc = l.service;
    const cancelled = !!svc.cancelledAt;
    return (
      <SummaryTile
        key={svc.id}
        href={`/services/${svc.id}`}
        icon={svc.type.icon}
        colour={l.colour}
        title={svc.name}
        meta={[
          svc.provider !== svc.name ? svc.provider : null,
          cancelled
            ? t('cancelledOn', { date: rc.dateYear(svc.cancelledAt!.slice(0, 10)) })
            : ts(`form.cadences.${svc.cadence}`),
          svc.ownerMemberId === me.id ? tm('yours') : null,
        ]
          .filter(Boolean)
          .join(' · ')}
        figure={l.monthlyMinor === null ? '—' : money(l.monthlyMinor)}
        figureSub={
          l.monthlyMinor === null ? t('noCharges') : t('tileSub', { amount: whole(l.yearMinor) })
        }
        next={
          cancelled ? (
            l.afterCancel ? (
              <Chip tone="bad" icon="alert">
                {t('stillCharging')}
              </Chip>
            ) : (
              <span className="muted small">{t('noMore')}</span>
            )
          ) : (
            <NextLine ctx={ctx} next={l.overview.next} name={null} />
          )
        }
        muted={cancelled && !l.afterCancel}
      />
    );
  };

  // The next charge of each subscription still going, soonest first.
  const coming = view.going
    .filter((l) => l.next)
    .sort((a, b) => a.next!.dueDate.localeCompare(b.next!.dueDate));
  const priced = view.going.filter((l) => l.monthlyMinor);
  const charging = view.cancelled.filter((l) => l.afterCancel);

  return (
    <div className="scr d3-main-svc">
      <BackLink href="/services">{tm('services')}</BackLink>
      <PageTitle
        eyebrow={tm('services')}
        title={title}
        lede={
          count
            ? t('lede', { count: view.going.length, amount: money(view.monthlyMinor) })
            : undefined
        }
        right={
          <LinkButton href={addHref} size="sm" icon="plus">
            {addLabel}
          </LinkButton>
        }
      />
      {count === 0 ? (
        <EmptyCard icon={empty.icon} title={empty.title} body={empty.body}>
          <LinkButton href={addHref} icon="plus">
            {addLabel}
          </LinkButton>
        </EmptyCard>
      ) : (
        <>
          {/* A cancelled one that still charges needs someone to act. */}
          {charging.map((l) => (
            <Notice
              key={l.service.id}
              tone="bad"
              icon="alert"
              href={`/services/${l.service.id}`}
              title={t('chargingTitle', { name: l.service.name })}
              body={t('chargingBody', {
                count: l.afterCancel,
                date: rc.dateYear(l.service.cancelledAt!.slice(0, 10)),
              })}
            />
          ))}

          {/* Each subscription first, each opening its own page. */}
          <SectionHead title={t('goingHead')} />
          {view.going.length ? (
            <div className="vx-grid">{view.going.map(tile)}</div>
          ) : (
            <p className="muted small">{t('noneGoing')}</p>
          )}
          {view.cancelled.length > 0 && (
            <>
              <SectionHead title={t('cancelledHead')} className="mt-2" />
              <div className="vx-grid">{view.cancelled.map(tile)}</div>
            </>
          )}

          {/* Then all of them together. */}
          <SectionHead title={t('together')} className="mt-2" />
          <div className="vx-top">
            <Card>
              <SectionHead title={t('perMonth')} />
              <div className="subs-total">
                <span className="fig hero-fig">{money(view.monthlyMinor)}</span>
                <span className="muted">
                  {t('aMonthFor', { count: view.going.length })} ·{' '}
                  {t('aYear', { amount: whole(view.monthlyMinor * 12) })}
                </span>
              </div>
              {priced.length > 0 && (
                <>
                  <StackBar
                    parts={priced.map((l) => ({
                      value: l.monthlyMinor!,
                      colour: l.colour,
                      label: l.service.name,
                      text: money(l.monthlyMinor!),
                      tip: `${l.service.name} · ${money(l.monthlyMinor!)} ${t('aMonth')}`,
                    }))}
                  />
                  <ul className="ov-list">
                    {priced.map((l) => (
                      <li key={l.service.id}>
                        <Swatch colour={l.colour} />
                        <span>{l.service.name}</span>
                        <b>{money(l.monthlyMinor!)}</b>
                        <span className="muted small">
                          {Math.round((l.monthlyMinor! / view.monthlyMinor) * 100)}%
                        </span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
              <p className="muted small mt-3">
                {t('yearSpent', { amount: whole(view.yearMinor) })}
              </p>
            </Card>
            <Card>
              <SectionHead
                title={t('comingUp')}
                right={<span className="muted">{t('comingHint')}</span>}
              />
              {coming.length ? (
                <ul className="subs-next">
                  {coming.map((l) => (
                    <li key={l.service.id}>
                      <Swatch colour={l.colour} />
                      <span>
                        <b>{l.service.name}</b>
                        <span className="muted small">{rc.dateYear(l.next!.dueDate)}</span>
                      </span>
                      {l.next!.status ? (
                        <StatusChip
                          status={{
                            label: statusLabel(rc, l.next!.status),
                            tone: l.next!.status.tone,
                          }}
                        />
                      ) : (
                        <span />
                      )}
                      <b>
                        {l.next!.amountMinor === null
                          ? '—'
                          : l.next!.status
                            ? money(l.next!.amountMinor)
                            : `≈ ${money(l.next!.amountMinor)}`}
                      </b>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="muted small">{t('nothingNext')}</p>
              )}
            </Card>
          </div>
          <YearAheadCard ctx={ctx} overview={view.overview} seriesName={name} />
          <MonthsCard ctx={ctx} overview={view.overview} seriesName={name} />
        </>
      )}
    </div>
  );
}
