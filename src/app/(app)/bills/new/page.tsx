import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { PageTitle } from '@/components/ui/blocks';
import { BackLink } from '@/components/ui/controls';
import { pageContext } from '@/lib/context';
import { listServices } from '@/lib/services';
import { listUnits } from '@/lib/units';
import { createBillAction } from '../actions';
import { BillForm } from '../bill-form';
import { splitPreviews } from '../split-previews';

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
    <div className="scr">
      <BackLink href="/bills">{t('title')}</BackLink>
      <PageTitle title={t('form.newTitle')} lede={t('form.newLede')} />
      <BillForm
        action={createBillAction}
        services={services.map((s) => ({
          id: s.id,
          // A sub-service reads "Subscriptions › Netflix".
          name: `${s.type.hasSubServices ? `${s.type.label} › ` : ''}${s.name}${s.ownerMemberId ? ` · ${t('tile.onlyYou')}` : ''}`,
          provider: s.provider,
          usageUnit: s.usageUnit,
          cadence: s.cadence,
        }))}
        units={listUnits().map((u) => ({ key: u.key, label: u.label }))}
        currency={hh.currency}
        locale={hh.locale}
        submitLabel={t('form.create')}
        cancelHref="/bills"
        splits={await splitPreviews(hh, services)}
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
