import { getTranslations } from 'next-intl/server';
import { PageTitle } from '@/components/ui/blocks';
import { BackLink } from '@/components/ui/controls';
import { pageContext } from '@/lib/context';
import { hasHousemates } from '@/lib/members';
import { createAssetAction } from '../../asset-actions';
import { VehicleForm } from '../../asset-form';

/** Adding a vehicle, on its own page (Vehicles → Add a vehicle). */
export default async function NewVehiclePage() {
  const { hh } = await pageContext();
  const t = await getTranslations('main');
  return (
    <div className="scr">
      <BackLink href="/services/category/vehicle">{t('main.vehicle')}</BackLink>
      <PageTitle title={t('vehicle.add')} lede={t('vehicle.addLede')} />
      <VehicleForm
        action={createAssetAction}
        whose={hasHousemates(hh.id)}
        cancelHref="/services/category/vehicle"
      />
    </div>
  );
}
