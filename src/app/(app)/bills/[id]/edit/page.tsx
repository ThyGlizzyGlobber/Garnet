import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { PageTitle } from '@/components/ui/blocks';
import { BackLink } from '@/components/ui/controls';
import { getBill, housematesPaid } from '@/lib/bills';
import { pageContext } from '@/lib/context';
import { formatMinorPlain } from '@/lib/format';
import { hasHousemates } from '@/lib/members';
import { mayChangeOwner } from '@/lib/ownership';
import { visibleTo } from '@/lib/scope';
import { listServices } from '@/lib/services';
import { listUnits } from '@/lib/units';
import { deleteBillAction, updateBillAction } from '../../actions';
import { BillForm } from '../../bill-form';
import { formAssets, formServices } from '../../form-options';
import { splitPreviews } from '../../split-previews';

export default async function EditBillPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { hh, me } = await pageContext();
  const t = await getTranslations('bills');
  const b = getBill(hh.id, id);
  if (!b || !visibleTo(b.ownerMemberId, me.id)) notFound();
  // Amounts as the form's inputs expect them ("129.00").
  const major = (minor: number | null) =>
    minor === null ? '' : formatMinorPlain(minor, b.currency);
  const locked = b.shares.some((s) => s.paidAt && s.paidMethod !== 'payer');
  // Whoever brought it in can say whose it is here too (not once housemates have paid shares).
  const showWhose =
    hasHousemates(hh.id) &&
    (!!b.ownerMemberId || !housematesPaid(hh.id, b.serviceId)) &&
    mayChangeOwner(hh.id, me, b.service);
  const services = listServices(hh.id, { includeInactive: true, viewer: me.id });
  return (
    <div className="scr">
      <BackLink href={`/bills/${b.id}`}>{t('form.backToBill')}</BackLink>
      <PageTitle title={t('editTitle')} lede={`${b.service.name} · ${b.service.provider}`} />
      <BillForm
        action={updateBillAction}
        deleteAction={deleteBillAction}
        services={await formServices(services)}
        assets={await formAssets(hh.id, me.id)}
        units={listUnits().map((u) => ({ key: u.key, label: u.label }))}
        currency={hh.currency}
        locale={hh.locale}
        submitLabel={t('form.save')}
        cancelHref={`/bills/${b.id}`}
        locked={locked}
        whose={
          showWhose
            ? { value: b.ownerMemberId ? 'mine' : 'household', split: hh.splitMode === 'shared' }
            : undefined
        }
        splits={await splitPreviews(hh, services)}
        initial={{
          id: b.id,
          serviceId: b.serviceId,
          amount: major(b.amountMinor),
          tax: major(b.taxMinor),
          taxLabel: b.taxLabel ?? '',
          periodStart: b.periodStart,
          periodEnd: b.periodEnd,
          issueDate: b.issueDate ?? '',
          dueDate: b.dueDate,
          usageQuantity: b.usageQuantity?.toString() ?? '',
          usageUnit: b.usageUnit ?? '',
          externalRef: b.externalRef ?? '',
          notes: b.notes ?? '',
          paidToProvider: b.paidToProviderAt !== null,
          assetId: b.assetId ?? '',
        }}
      />
    </div>
  );
}
