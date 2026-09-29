import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { PageHeader } from '@/components/ui';
import { pageContext } from '@/lib/context';
import { listServices } from '@/lib/services';
import { listUnits } from '@/lib/units';
import { createBillAction } from '../actions';
import { BillForm } from '../bill-form';

export default async function NewBillPage({
  searchParams,
}: {
  searchParams: Promise<{ service?: string; personal?: string }>;
}) {
  const { hh, me, today } = await pageContext();
  const t = await getTranslations('bills');
  // The household's services and this member's own.
  const services = listServices(hh.id, { viewer: me.id });
  if (services.length === 0) redirect('/services/new');
  const { service, personal } = await searchParams;
  const first =
    services.find((s) => s.id === service) ??
    (personal ? services.find((s) => s.ownerMemberId) : undefined) ??
    services[0]!;
  return (
    <div className="mx-auto max-w-xl">
      <PageHeader title={t('new')} />
      <BillForm
        action={createBillAction}
        services={services.map((s) => ({
          id: s.id,
          name: s.ownerMemberId ? `${s.name} · ${t('tile.onlyYou')}` : s.name,
          provider: s.provider,
          usageUnit: s.usageUnit,
          cadence: s.cadence,
        }))}
        units={listUnits().map((u) => ({ key: u.key, label: u.label }))}
        currency={hh.currency}
        submitLabel={t('form.create')}
        cancelHref={personal ? '/?view=mine' : '/bills'}
        initial={{
          serviceId: first.id,
          amount: '',
          tax: '',
          taxLabel: '',
          periodStart: '',
          periodEnd: '',
          issueDate: today,
          dueDate: '',
          usageQuantity: '',
          usageUnit: first.usageUnit ?? '',
          externalRef: '',
          notes: '',
          paidToProvider: false,
        }}
      />
    </div>
  );
}
