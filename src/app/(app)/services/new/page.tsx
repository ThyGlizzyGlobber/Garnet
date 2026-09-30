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
import { nextPaletteColour, TYPE_COLOUR } from '@/lib/palette';
import { listServices } from '@/lib/services';
import { createServiceAction } from '../actions';
import { ServiceForm } from '../service-form';
import { isAdmin } from '@/lib/roles';

export default async function NewServicePage({
  searchParams,
}: {
  searchParams: Promise<{ personal?: string }>;
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
  const personal = housemates && !!(await searchParams).personal;
  const first = (personal ? types.find((ty) => ty.personalByDefault) : undefined) ?? types[0]!;
  const used = listServices(hh.id, { includeInactive: true }).map((s) => s.colour);
  const colour =
    TYPE_COLOUR[first.slug] && !used.includes(TYPE_COLOUR[first.slug]!)
      ? TYPE_COLOUR[first.slug]!
      : nextPaletteColour(used);
  return (
    <div className="scr">
      <BackLink href="/services">{t('title')}</BackLink>
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
        cancelHref="/services"
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
          personal: personal || (housemates && first.personalByDefault),
        }}
      />
    </div>
  );
}
