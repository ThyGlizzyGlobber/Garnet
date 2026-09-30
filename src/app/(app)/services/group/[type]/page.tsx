import { notFound, redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { pageContext } from '@/lib/context';
import { subscriptionsView } from '@/lib/main-view';
import { inMainCategory } from '@/lib/service-categories';
import { listServiceTypes } from '@/lib/services';
import { SubscriptionsPage } from '../../service-cards';

/**
 * Subscriptions: a row per subscription and all of them together. Any other
 * type opens its main service's page (Vehicles, Health, Lifestyle, where
 * Donations and its charities sit).
 */
export default async function ServiceGroupPage({ params }: { params: Promise<{ type: string }> }) {
  const { type: slug } = await params;
  const type = listServiceTypes().find((ty) => ty.slug === slug);
  if (!type) notFound();
  if (inMainCategory(type)) redirect(`/services/category/${type.category}`);
  if (type.slug !== 'subscriptions') notFound();
  const ctx = await pageContext();
  const t = await getTranslations('services');
  const tm = await getTranslations('main.subs');
  return (
    <SubscriptionsPage
      ctx={ctx}
      view={subscriptionsView(ctx.hh, ctx.me, ctx.today)}
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
