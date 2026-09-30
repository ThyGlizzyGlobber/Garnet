import { getTranslations } from 'next-intl/server';
import { rowCtx, statusLabel } from '@/components/app/bill-rows';
import { SummaryTile } from '@/components/app/summary-tile';
import { StackBar } from '@/components/charts/stack-bar';
import { Card, LinkButton } from '@/components/ui';
import { EmptyCard, PageTitle, SectionHead } from '@/components/ui/blocks';
import { Swatch } from '@/components/ui/colour';
import { BackLink } from '@/components/ui/controls';
import { BillRow, Rows, type BillRowModel } from '@/components/ui/rows';
import { billDue } from '@/lib/bill-status';
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
        figure={whole(c.overview.yearMinor)}
        figureSub={t('tileYear', { amount: whole(c.overview.perMonthMinor) })}
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
 * Subscriptions, as plain as the Bills page: a row per subscription (its
 * price a month and its next charge; the row opens its own page), the
 * cancelled ones after; beside them, all of them together a month and
 * which take the most. Numbers from subscriptionsView().
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
  const { hh, money } = ctx;
  const t = await getTranslations('main.subs');
  const tm = await getTranslations('main');
  const ts = await getTranslations('services');
  const rc = rowCtx(ctx, await getTranslations('ui'));
  const whole = (minor: number) => money(minor, hh.currency, { whole: true });
  const count = view.going.length + view.cancelled.length;

  const row = (l: SubscriptionLine): BillRowModel => {
    const svc = l.service;
    const cancelled = !!svc.cancelledAt;
    return {
      href: `/services/${svc.id}`,
      title: svc.name,
      provider: svc.provider !== svc.name ? svc.provider : undefined,
      sub: cancelled
        ? t('cancelledOn', { date: rc.dateYear(svc.cancelledAt!.slice(0, 10)) })
        : [
            ts(`form.cadences.${svc.cadence}`),
            l.next && !l.next.status ? t('nextOn', { date: rc.date(l.next.dueDate) }) : null,
          ]
            .filter(Boolean)
            .join(' · '),
      amount: l.monthlyMinor === null ? '—' : money(l.monthlyMinor),
      share: l.monthlyMinor === null ? undefined : t('aMonth'),
      // A charge still to pay, else how the latest one stands.
      status: l.next?.status
        ? { label: statusLabel(rc, l.next.status), tone: l.next.status.tone }
        : l.latest
          ? (() => {
              const st = billDue(l.latest, ctx.today).status;
              return { label: statusLabel(rc, st), tone: st.tone };
            })()
          : { label: t('noCharges'), tone: 'neutral' },
      tags: [
        ...(cancelled
          ? [
              l.afterCancel
                ? { label: t('stillCharging'), tone: 'bad' as const, icon: 'alert' }
                : { label: t('cancelled'), tone: 'neutral' as const },
            ]
          : []),
        ...(svc.ownerMemberId ? [{ label: tm('yours'), tone: 'info' as const, icon: 'user' }] : []),
      ],
      disc: { icon: svc.type.icon, colour: l.colour },
      colour: l.colour,
    };
  };

  const priced = view.going.filter((l) => l.monthlyMinor);
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
        <div className="d3-cols">
          <div className="d3-main">
            <Card className="p-2">
              <Rows>
                {view.going.map((l) => (
                  <BillRow key={l.service.id} bill={row(l)} />
                ))}
              </Rows>
            </Card>
            {view.cancelled.length > 0 && (
              <>
                <SectionHead title={t('cancelledHead')} className="mt-2" />
                <Card className="p-2 subs-cancelled">
                  <Rows>
                    {view.cancelled.map((l) => (
                      <BillRow key={l.service.id} bill={row(l)} />
                    ))}
                  </Rows>
                </Card>
              </>
            )}
          </div>
          <aside className="d3-aside">
            <Card>
              <SectionHead title={t('together')} />
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
          </aside>
        </div>
      )}
    </div>
  );
}
