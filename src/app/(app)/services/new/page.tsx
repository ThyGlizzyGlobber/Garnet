import { getTranslations } from 'next-intl/server';
import { hasHousemates } from '@/lib/members';
import { PageHeader } from '@/components/ui';
import { CADENCES, SPLIT_MODES } from '@/db/schema';
import { pageContext } from '@/lib/context';
import { listMembers } from '@/lib/members';
import { listServiceTypes, SEASONAL_TYPES } from '@/lib/services';
import { listUnits } from '@/lib/units';
import { nextPaletteColour, TYPE_COLOUR } from '@/lib/palette';
import { listServices } from '@/lib/services';
import { createServiceAction } from '../actions';
import { ServiceForm } from '../service-form';

export default async function NewServicePage({
  searchParams,
}: {
  searchParams: Promise<{ personal?: string }>;
}) {
  const { hh, me } = await pageContext();
  const t = await getTranslations('services');
  const types = listServiceTypes();
  // From the personal dashboard: start on a kind of service that's usually one person's own.
  const housemates = hasHousemates(hh.id);
  const personal = housemates && !!(await searchParams).personal;
  const first = (personal ? types.find((ty) => ty.personalByDefault) : undefined) ?? types[0]!;
  const used = listServices(hh.id, { includeInactive: true }).map((s) => s.colour);
  const colour =
    TYPE_COLOUR[first.slug] && !used.includes(TYPE_COLOUR[first.slug]!)
      ? TYPE_COLOUR[first.slug]!
      : nextPaletteColour(used);
  return (
    <div className="mx-auto max-w-xl">
      <PageHeader title={t('new')} />
      <ServiceForm
        action={createServiceAction}
        types={types}
        units={listUnits()}
        members={listMembers(hh.id).map((m) => ({ id: m.id, name: m.name }))}
        cadences={CADENCES}
        splitModes={SPLIT_MODES}
        sharedHousehold={hh.splitMode === 'shared'}
        canBePersonal={housemates}
        submitLabel={t('form.create')}
        cancelHref={personal ? '/?view=mine' : '/services'}
        initial={{
          typeSlug: first.slug,
          name: first.label,
          provider: '',
          accountRef: '',
          cadence: 'monthly',
          usageUnit: first.defaultUnit ?? '',
          usageLimit: '',
          splitMode: 'equal',
          payerMemberId: me.id,
          colour,
          isActive: true,
          notes: '',
          trustedSenders: '',
          autoPay: false,
          seasonal: SEASONAL_TYPES.includes(first.slug),
          customSplits: {},
          personal: personal || (housemates && first.personalByDefault),
        }}
      />
    </div>
  );
}
