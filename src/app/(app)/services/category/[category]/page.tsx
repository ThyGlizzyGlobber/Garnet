import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { Card } from '@/components/ui';
import { pageContext } from '@/lib/context';
import { serviceCardsView, vehiclesView } from '@/lib/main-view';
import { CATEGORY_ICONS, isGroupedCategory } from '@/lib/service-categories';
import { ServiceCardsPage } from '../../service-cards';
import { VehiclesPage } from '../../vehicles-page';

/**
 * A category that is a main service: Vehicles (a card per vehicle, ?kind=
 * shows one kind of bill) or Health and Lifestyle (a card per service).
 * ?open= opens one card, as the nav and back links ask.
 */
export default async function CategoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ category: string }>;
  searchParams: Promise<{ kind?: string; open?: string; filed?: string }>;
}) {
  const { category } = await params;
  if (!isGroupedCategory(category)) notFound();
  const q = await searchParams;
  const ctx = await pageContext();
  const t = await getTranslations('main');
  if (category === 'vehicle') {
    const filed = Number(q.filed) || 0;
    return (
      <>
        {filed > 0 && (
          <Card className="bg-accent-soft filed-note">
            <p className="small">{t('vehicle.filed', { count: filed })}</p>
          </Card>
        )}
        <VehiclesPage
          ctx={ctx}
          view={vehiclesView(ctx.hh, ctx.me, ctx.today, q.kind ?? null)}
          open={q.open ?? null}
        />
      </>
    );
  }
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
