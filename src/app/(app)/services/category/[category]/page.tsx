import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { pageContext } from '@/lib/context';
import { serviceCardsView, vehiclesView } from '@/lib/main-view';
import { CATEGORY_ICONS, isGroupedCategory } from '@/lib/service-categories';
import { ServiceTilesPage } from '../../service-cards';
import { VehiclesPage } from '../../vehicles-page';

/**
 * A category that is a main service: Vehicles, Health or Lifestyle. A tile
 * each (a vehicle, a service) opening its own page, then all of them together.
 */
export default async function CategoryPage({ params }: { params: Promise<{ category: string }> }) {
  const { category } = await params;
  if (!isGroupedCategory(category)) notFound();
  const ctx = await pageContext();
  const t = await getTranslations('main');
  if (category === 'vehicle')
    return <VehiclesPage ctx={ctx} view={vehiclesView(ctx.hh, ctx.me, ctx.today)} />;
  return (
    <ServiceTilesPage
      ctx={ctx}
      view={serviceCardsView(ctx.hh, ctx.me, { category }, ctx.today)}
      title={t(`main.${category}`)}
      addHref={`/services/new?category=${category}`}
      addLabel={t('addService')}
      empty={{
        icon: CATEGORY_ICONS[category],
        title: t('emptyTitle', { name: t(`main.${category}`) }),
        body: t(`emptyBody.${category}`),
      }}
    />
  );
}
