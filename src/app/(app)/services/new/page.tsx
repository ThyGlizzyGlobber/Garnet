import { getTranslations } from 'next-intl/server';
import { hasHousemates } from '@/lib/members';
import { PageTitle } from '@/components/ui/blocks';
import { BackLink } from '@/components/ui/controls';
import { CADENCES, SPLIT_MODES } from '@/db/schema';
import { pageContext } from '@/lib/context';
import { listMembers } from '@/lib/members';
import { listServices, listServiceTypes, SEASONAL_TYPES } from '@/lib/services';
import { listUnits } from '@/lib/units';
import { todayIn } from '@/lib/dates';
import { createServiceAction } from '../actions';
import { ServiceForm } from '../service-form';
import { isAdmin } from '@/lib/roles';
import { isGroupedCategory } from '@/lib/service-categories';

export default async function NewServicePage({
  searchParams,
}: {
  searchParams: Promise<{ personal?: string; type?: string; category?: string }>;
}) {
  const { hh, me } = await pageContext();
  const t = await getTranslations('services');
  const tm = await getTranslations('main');
  const ts = await getTranslations('services.split');
  const current = listMembers(hh.id).filter(
    (m) => m.activeTo === null || m.activeTo >= todayIn(hh.timezone),
  );
  const params = await searchParams;
  // "Add a service" on Health, Lifestyle or Home & property starts inside it.
  const category = isGroupedCategory(params.category) ? params.category : null;
  const types = listServiceTypes().map((ty) => ({
    ...ty,
    seasonal: SEASONAL_TYPES.includes(ty.slug),
  }));
  // From the personal dashboard: it's usually one person's own.
  const housemates = hasHousemates(hh.id);
  const personal = housemates && !!params.personal;
  // "Add a subscription" from a main service's page starts on its type.
  const first = types.find((ty) => ty.slug === params.type) ?? null;
  const back = category
    ? `/services/category/${category}`
    : first?.hasSubServices
      ? `/services/group/${first.slug}`
      : '/services';
  return (
    <div className="scr">
      <BackLink href={back}>
        {category ? tm(`main.${category}`) : first?.hasSubServices ? first.label : t('title')}
      </BackLink>
      <PageTitle title={t('form.newTitle')} lede={t('form.newLede')} />
      <ServiceForm
        action={createServiceAction}
        types={types}
        initialTop={category ? `cat:${category}` : null}
        existing={listServices(hh.id, { viewer: me.id, includeInactive: true }).map((s) => ({
          id: s.id,
          name: s.name,
          provider: s.provider,
        }))}
        units={listUnits()}
        members={current.map((m) => ({
          id: m.id,
          name: m.name,
          colour: m.colour,
          splitWeight: m.splitWeight,
        }))}
        split={{
          canEdit: isAdmin(me),
          currency: hh.currency,
          locale: hh.locale,
          latestMinor: null,
          resplitCount: 0,
          percents: {},
          amounts: {},
          summary: current.map((m) => ({ name: m.name, colour: m.colour, part: ts('parts.even') })),
        }}
        cadences={CADENCES}
        splitModes={SPLIT_MODES}
        sharedHousehold={hh.splitMode === 'shared'}
        canBePersonal={housemates}
        submitLabel={t('form.create')}
        cancelHref={back}
        initial={{
          typeSlug: first?.slug ?? '',
          name: !first || first.hasSubServices ? '' : first.label,
          provider: '',
          accountRef: '',
          cadence: 'monthly',
          usageUnit: first?.defaultUnit ?? '',
          usageLimit: '',
          splitMode: 'equal',
          payerMemberId: me.id,
          isActive: true,
          notes: '',
          trustedSenders: '',
          autoPay: false,
          seasonal: !!first?.seasonal,
          recurring: !!first?.hasSubServices,
          personal: personal || (housemates && !!first?.personalByDefault),
        }}
      />
    </div>
  );
}
