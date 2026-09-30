import { getTranslations } from 'next-intl/server';
import { hasHousemates } from '@/lib/members';
import { PageTitle } from '@/components/ui/blocks';
import { BackLink } from '@/components/ui/controls';
import { CADENCES, SPLIT_MODES } from '@/db/schema';
import { pageContext } from '@/lib/context';
import { listMembers } from '@/lib/members';
import { listServiceTypes, SEASONAL_TYPES } from '@/lib/services';
import { listUnits } from '@/lib/units';
import { todayIn } from '@/lib/dates';
import { createServiceAction } from '../actions';
import { ServiceForm } from '../service-form';
import { isAdmin } from '@/lib/roles';

export default async function NewServicePage({
  searchParams,
}: {
  searchParams: Promise<{ personal?: string; type?: string }>;
}) {
  const { hh, me } = await pageContext();
  const t = await getTranslations('services');
  const ts = await getTranslations('services.split');
  const current = listMembers(hh.id).filter(
    (m) => m.activeTo === null || m.activeTo >= todayIn(hh.timezone),
  );
  const types = listServiceTypes();
  // From the personal dashboard: start on a kind of service that's usually one person's own.
  const housemates = hasHousemates(hh.id);
  const params = await searchParams;
  const personal = housemates && !!params.personal;
  // "Add a subscription" from a main service's page starts on its type.
  const first =
    types.find((ty) => ty.slug === params.type) ??
    (personal ? types.find((ty) => ty.personalByDefault) : undefined) ??
    types[0]!;
  const back = first.hasSubServices && params.type ? `/services/group/${first.slug}` : '/services';
  return (
    <div className="scr">
      <BackLink href={back}>
        {first.hasSubServices && params.type ? first.label : t('title')}
      </BackLink>
      <PageTitle title={t('form.newTitle')} lede={t('form.newLede')} />
      <ServiceForm
        action={createServiceAction}
        types={types}
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
          typeSlug: first.slug,
          name: first.hasSubServices ? '' : first.label,
          provider: '',
          accountRef: '',
          cadence: 'monthly',
          usageUnit: first.defaultUnit ?? '',
          usageLimit: '',
          splitMode: 'equal',
          payerMemberId: me.id,
          isActive: true,
          notes: '',
          trustedSenders: '',
          autoPay: false,
          seasonal: SEASONAL_TYPES.includes(first.slug),
          personal: personal || (housemates && first.personalByDefault),
        }}
      />
    </div>
  );
}
