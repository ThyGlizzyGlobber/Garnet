import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { LinkButton } from '@/components/ui';
import { EmptyCard, PageTitle, SectionHead } from '@/components/ui/blocks';
import { BackLink } from '@/components/ui/controls';
import { pageContext } from '@/lib/context';
import { listServiceTypes } from '@/lib/services';
import { servicesView } from '@/lib/services-view';
import { ribbonRenderer } from '../../ribbon';

/**
 * A main service and its sub-services (Subscriptions → Netflix, Spotify):
 * what they add up to, a ribbon for each still going, then the ones someone
 * cancelled, with their bills kept. Numbers from servicesView().
 */
export default async function ServiceGroupPage({ params }: { params: Promise<{ type: string }> }) {
  const { type: slug } = await params;
  const type = listServiceTypes().find((ty) => ty.slug === slug && ty.hasSubServices);
  if (!type) notFound();
  const ctx = await pageContext();
  const { hh, me, money } = ctx;
  const t = await getTranslations('services');
  const view = servicesView(hh, me.id, ctx.today, 'all', undefined, type.slug);
  const ribbon = await ribbonRenderer(ctx, view.window);
  const going = view.services.filter((s) => !s.cancelled);
  const cancelled = view.services.filter((s) => s.cancelled);
  const yearMinor = view.services.reduce((sum, s) => sum + s.yearMinor, 0);
  const add = `/services/new?type=${encodeURIComponent(type.slug)}`;

  return (
    <div className="scr d3-services">
      <BackLink href="/services">{t('title')}</BackLink>
      <PageTitle
        eyebrow={t(`categories.${type.category}`)}
        title={type.label}
        lede={
          view.services.length
            ? t('group.lede', {
                count: going.length,
                cancelled: cancelled.length,
                amount: money(yearMinor, hh.currency, { whole: true }),
              })
            : t('group.ledeEmpty', { type: type.label.toLowerCase() })
        }
        right={
          <LinkButton href={add} variant="secondary" size="sm" icon="plus">
            {t('group.add')}
          </LinkButton>
        }
      />
      {view.services.length === 0 ? (
        <EmptyCard
          icon={type.icon}
          title={t('group.emptyTitle', { type: type.label })}
          body={t('group.emptyBody')}
        >
          <LinkButton href={add} variant="secondary" icon="plus">
            {t('group.add')}
          </LinkButton>
        </EmptyCard>
      ) : (
        <>
          {going.map((s) => ribbon(s))}
          {cancelled.length > 0 && (
            <>
              <SectionHead title={t('group.cancelledHead')} className="mt-2" />
              {cancelled.map((s) => ribbon(s))}
            </>
          )}
        </>
      )}
    </div>
  );
}
