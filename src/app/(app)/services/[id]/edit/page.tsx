import { notFound } from 'next/navigation';
import { hasHousemates } from '@/lib/members';
import { mayChangeOwner } from '@/lib/ownership';
import { visibleTo } from '@/lib/scope';
import { getTranslations } from 'next-intl/server';
import { LinkButton, PageHeader } from '@/components/ui';
import { CADENCES, SPLIT_MODES } from '@/db/schema';
import { pageContext } from '@/lib/context';
import { formatMoney } from '@/lib/format';
import { getService, listServiceTypes } from '@/lib/services';
import { splitView } from '@/lib/split-view';
import { partText } from '../../split-text';
import { listUnits } from '@/lib/units';
import { updateServiceAction } from '../../actions';
import { ServiceForm } from '../../service-form';

export default async function EditServicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { hh, me } = await pageContext();
  const t = await getTranslations('services');
  const ts = await getTranslations('services.split');
  const s = getService(hh.id, id);
  if (!s || !visibleTo(s.ownerMemberId, me.id)) notFound();
  const view = splitView(hh.id, s);
  const money = (minor: number) => formatMoney(minor, hh.currency, hh.locale);
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
        members={view.parts.map(({ member: m }) => ({
          id: m.id,
          name: m.name,
          colour: m.colour,
          splitWeight: m.splitWeight,
        }))}
        split={{
          canEdit: me.role === 'owner',
          currency: hh.currency,
          locale: hh.locale,
          latestMinor: view.latestMinor,
          resplitCount: view.resplitCount,
          percents: view.percents,
          amounts: view.amounts,
          summary: view.parts.map((p) => ({
            name: p.member.name,
            colour: p.member.colour,
            part: partText(ts, p.setting, money),
          })),
        }}
        cadences={CADENCES}
        splitModes={SPLIT_MODES}
        sharedHousehold={hh.splitMode === 'shared'}
        canBePersonal={hasHousemates(hh.id)}
        canChangePersonal={mayChangeOwner(hh.id, me, s)}
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
          personal: !!s.ownerMemberId,
        }}
      />
    </div>
  );
}
