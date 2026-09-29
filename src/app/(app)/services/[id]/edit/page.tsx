import { notFound } from 'next/navigation';
import { visibleTo } from '@/lib/scope';
import { getTranslations } from 'next-intl/server';
import { LinkButton, PageHeader } from '@/components/ui';
import { CADENCES, SPLIT_MODES } from '@/db/schema';
import { pageContext } from '@/lib/context';
import { listMembers } from '@/lib/members';
import { getCustomSplits, getService, listServiceTypes } from '@/lib/services';
import { listUnits } from '@/lib/units';
import { updateServiceAction } from '../../actions';
import { ServiceForm } from '../../service-form';

export default async function EditServicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { hh, me } = await pageContext();
  const t = await getTranslations('services');
  const s = getService(hh.id, id);
  if (!s || !visibleTo(s.ownerMemberId, me.id)) notFound();
  return (
    <div className="mx-auto max-w-xl">
      <PageHeader
        title={s.name}
        subtitle={s.provider}
        action={
          <LinkButton href={`/bills/new?service=${s.id}`} variant="secondary">
            {t('addBill')}
          </LinkButton>
        }
      />
      <ServiceForm
        action={updateServiceAction}
        types={listServiceTypes()}
        units={listUnits()}
        members={listMembers(hh.id).map((m) => ({ id: m.id, name: m.name }))}
        cadences={CADENCES}
        splitModes={SPLIT_MODES}
        sharedHousehold={hh.splitMode === 'shared'}
        canChangePersonal={
          s.ownerMemberId
            ? s.ownerMemberId === me.id
            : me.role === 'owner' || s.payerMemberId === me.id
        }
        submitLabel={t('form.save')}
        cancelHref="/services"
        initial={{
          id: s.id,
          typeSlug: s.typeSlug,
          name: s.name,
          provider: s.provider,
          accountRef: s.accountRef ?? '',
          cadence: s.cadence,
          usageUnit: s.usageUnit ?? '',
          usageLimit: s.usageLimitMonthly?.toString() ?? '',
          splitMode: s.splitMode,
          payerMemberId: s.payerMemberId ?? '',
          colour: s.colour,
          isActive: s.isActive,
          notes: s.notes ?? '',
          trustedSenders: s.trustedSenders.join(', '),
          autoPay: s.autoPay,
          seasonal: s.seasonal,
          customSplits: getCustomSplits(hh.id, s.id),
          personal: !!s.ownerMemberId,
        }}
      />
    </div>
  );
}
