import { notFound, redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { pageContext } from '@/lib/context';
import {
  serviceCardsView,
  subscriptionsView,
  type ServiceCardsView,
  type SubscriptionsView,
} from '@/lib/main-view';
import { orderChildren } from '@/lib/nav-layout';
import { getNavLayout } from '@/lib/nav-store';
import { inMainCategory } from '@/lib/service-categories';
import { listServiceTypes } from '@/lib/services';
import { ServiceTilesPage, SubscriptionsPage } from '../../service-cards';

/**
 * Subscriptions: a row per subscription and all of them together.
 * Donations: a tile per charity and all of them together, like Lifestyle.
 * Any other type opens its main service's page (Vehicles, Health, Lifestyle).
 */
export default async function ServiceGroupPage({ params }: { params: Promise<{ type: string }> }) {
  const { type: slug } = await params;
  const type = listServiceTypes().find((ty) => ty.slug === slug);
  if (!type) notFound();
  if (inMainCategory(type)) redirect(`/services/category/${type.category}`);
  const ctx = await pageContext();
  const t = await getTranslations('services');
  // In the order the household gave them (the Arrange card).
  const layout = getNavLayout(ctx.me);
  const keys = [`t:${type.slug}`, `mt:${type.slug}`];
  const inOrder = (v: ServiceCardsView): ServiceCardsView => ({
    ...v,
    cards: orderChildren(v.cards, (c) => c.service.id, layout, keys),
    stopped: orderChildren(v.stopped, (c) => c.service.id, layout, keys),
  });
  const subscriptionsInOrder = (v: SubscriptionsView): SubscriptionsView => ({
    ...v,
    going: orderChildren(v.going, (l) => l.service.id, layout, keys),
    cancelled: orderChildren(v.cancelled, (l) => l.service.id, layout, keys),
  });
  if (type.slug === 'donations') {
    const tm = await getTranslations('main');
    return (
      <ServiceTilesPage
        ctx={ctx}
        view={inOrder(serviceCardsView(ctx.hh, ctx.me, { typeSlug: type.slug }, ctx.today))}
        title={type.label}
        addHref={`/services/new?type=${encodeURIComponent(type.slug)}`}
        addLabel={tm('addCharity')}
        empty={{
          icon: type.icon,
          title: tm('emptyTitle', { name: type.label }),
          body: tm('emptyBody.donations'),
        }}
      />
    );
  }
  if (type.slug !== 'subscriptions') notFound();
  const tm = await getTranslations('main.subs');
  return (
    <SubscriptionsPage
      ctx={ctx}
      view={subscriptionsInOrder(subscriptionsView(ctx.hh, ctx.me, ctx.today))}
      title={type.label}
      addHref={`/services/new?type=${encodeURIComponent(type.slug)}`}
      addLabel={tm('add')}
      empty={{
        icon: type.icon,
        title: t('group.emptyTitle', { type: type.label }),
        body: t('group.emptyBody'),
      }}
    />
  );
}
