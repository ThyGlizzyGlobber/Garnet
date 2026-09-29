import { notFound } from 'next/navigation';
import { visibleTo } from '@/lib/scope';
import { getTranslations } from 'next-intl/server';
import { PageHeader } from '@/components/ui';
import { getBill } from '@/lib/bills';
import { pageContext } from '@/lib/context';
import { minorUnitDigits } from '@/lib/format';
import { listServices } from '@/lib/services';
import { listUnits } from '@/lib/units';
import { updateBillAction } from '../../actions';
import { BillForm } from '../../bill-form';

export default async function EditBillPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { hh, me } = await pageContext();
  const t = await getTranslations('bills');
  const b = getBill(hh.id, id);
  if (!b || !visibleTo(b.ownerMemberId, me.id)) notFound();
  const digits = minorUnitDigits(b.currency);
  const major = (minor: number | null) =>
    minor === null ? '' : (minor / 10 ** digits).toFixed(digits);
  const locked = b.shares.some((s) => s.paidAt && s.paidMethod !== 'payer');
  return (
    <div className="mx-auto max-w-xl">
      <PageHeader title={t('editTitle')} />
      <BillForm
        action={updateBillAction}
        services={listServices(hh.id, { includeInactive: true, viewer: me.id }).map((s) => ({
          id: s.id,
          name: s.ownerMemberId ? `${s.name} · ${t('tile.onlyYou')}` : s.name,
          provider: s.provider,
          usageUnit: s.usageUnit,
          cadence: s.cadence,
        }))}
        units={listUnits().map((u) => ({ key: u.key, label: u.label }))}
        currency={hh.currency}
        submitLabel={t('form.save')}
        cancelHref={`/bills/${b.id}`}
        locked={locked}
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
        }}
      />
    </div>
  );
}
