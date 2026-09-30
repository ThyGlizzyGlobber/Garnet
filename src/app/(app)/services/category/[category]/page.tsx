import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { pageContext } from '@/lib/context';
import { serviceCardsView, vehiclesView } from '@/lib/main-view';
import { CATEGORY_ICONS, isGroupedCategory } from '@/lib/service-categories';
import { ServiceCardsPage } from '../../service-cards';
import { VehiclesPage } from '../../vehicles-page';

/**
 * A category that is a main service: Vehicles (all of them together, a tile
 * each opening its own page) or Health and Lifestyle (a card per service;
 * ?open= opens one, as the nav and back links ask).
 */
export default async function CategoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ category: string }>;
  searchParams: Promise<{ open?: string }>;
}) {
  const { category } = await params;
  if (!isGroupedCategory(category)) notFound();
  const q = await searchParams;
  const ctx = await pageContext();
  const t = await getTranslations('main');
  if (category === 'vehicle')
    return <VehiclesPage ctx={ctx} view={vehiclesView(ctx.hh, ctx.me, ctx.today)} />;
  return (
    <ServiceCardsPage
      ctx={ctx}
      view={serviceCardsView(ctx.hh, ctx.me, { category }, ctx.today)}
      title={t(`main.${category}`)}
      eyebrow={t('services')}
      addHref={`/services/new?category=${category}`}
      addLabel={t('addService')}
      empty={{
        icon: CATEGORY_ICONS[category],
        title: t('emptyTitle', { name: t(`main.${category}`) }),
        body: t(`emptyBody.${category}`),
      }}
      open={q.open ?? null}
    />
  );
}
