import { notFound, redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { pageContext } from '@/lib/context';
import { serviceCardsView } from '@/lib/main-view';
import { inMainCategory } from '@/lib/service-categories';
import { listServiceTypes } from '@/lib/services';
import { ServiceCardsPage } from '../../service-cards';

/**
 * A main service with sub-services (Subscriptions → Netflix, Spotify;
 * Donations → Red Cross): a card each, opening to its bills, the cancelled
 * ones after. A type under Vehicles, Health or Lifestyle has no page of its
 * own: it opens its main service's (Vehicles showing that kind).
 */
export default async function ServiceGroupPage({
  params,
  searchParams,
}: {
  params: Promise<{ type: string }>;
  searchParams: Promise<{ open?: string }>;
}) {
  const { type: slug } = await params;
  const type = listServiceTypes().find((ty) => ty.slug === slug);
  if (!type) notFound();
  if (inMainCategory(type))
    redirect(
      type.category === 'vehicle'
        ? '/services/category/vehicle'
        : `/services/category/${type.category}`,
    );
  if (!type.hasSubServices) notFound();
  const { open } = await searchParams;
  const ctx = await pageContext();
  const t = await getTranslations('services');
  const tm = await getTranslations('main');
  return (
    <ServiceCardsPage
      ctx={ctx}
      view={serviceCardsView(ctx.hh, ctx.me, { typeSlug: type.slug }, ctx.today)}
      title={type.label}
      eyebrow={tm('services')}
      addHref={`/services/new?type=${encodeURIComponent(type.slug)}`}
      addLabel={t('group.add')}
      empty={{
        icon: type.icon,
        title: t('group.emptyTitle', { type: type.label }),
        body: t('group.emptyBody'),
      }}
      open={open ?? null}
    />
  );
}
