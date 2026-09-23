import { getTranslations } from 'next-intl/server';
import { PageHeader } from '@/components/ui';
import { CADENCES, SPLIT_MODES } from '@/db/schema';
import { pageContext } from '@/lib/context';
import { listMembers } from '@/lib/members';
import { listServiceTypes } from '@/lib/services';
import { listUnits } from '@/lib/units';
import { nextPaletteColour, TYPE_COLOUR } from '@/lib/palette';
import { listServices } from '@/lib/services';
import { createServiceAction } from '../actions';
import { ServiceForm } from '../service-form';

export default async function NewServicePage() {
  const { hh, me } = await pageContext();
  const t = await getTranslations('services');
  const types = listServiceTypes();
  const first = types[0]!;
  const used = listServices(undefined, true).map((s) => s.colour);
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
        members={listMembers().map((m) => ({ id: m.id, name: m.name }))}
        cadences={CADENCES}
        splitModes={SPLIT_MODES}
        sharedHousehold={hh.splitMode === 'shared'}
        submitLabel={t('form.create')}
        cancelHref="/services"
        initial={{
          typeSlug: first.slug,
          name: first.label,
          provider: '',
          accountRef: '',
          cadence: 'monthly',
          usageUnit: first.defaultUnit ?? '',
          splitMode: 'equal',
          payerMemberId: me.id,
          colour,
          isActive: true,
          notes: '',
          customSplits: {},
        }}
      />
    </div>
  );
}
