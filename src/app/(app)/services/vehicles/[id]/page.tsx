import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { Card } from '@/components/ui';
import { PageTitle, SectionHead } from '@/components/ui/blocks';
import { BackLink } from '@/components/ui/controls';
import { InlineAction } from '@/components/ui/form';
import { canEditAsset, getAsset } from '@/lib/assets';
import { pageContext } from '@/lib/context';
import { hasHousemates } from '@/lib/members';
import { visibleTo } from '@/lib/scope';
import { deleteAssetAction, updateAssetAction } from '../../asset-actions';
import { VehicleForm } from '../../asset-form';

/** Changing a vehicle (name, plate, whose), or removing it, on its own page. */
export default async function EditVehiclePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { hh, me } = await pageContext();
  const a = getAsset(hh.id, id);
  if (!a || !visibleTo(a.ownerMemberId, me.id) || !canEditAsset(me, a)) notFound();
  const t = await getTranslations('main');
  const back = `/services/category/vehicle?open=${a.id}#v-${a.id}`;
  return (
    <div className="scr">
      <BackLink href={back}>{t('main.vehicle')}</BackLink>
      <PageTitle title={a.name} lede={t('vehicle.editLede')} />
      <VehicleForm
        action={updateAssetAction}
        whose={hasHousemates(hh.id)}
        cancelHref={back}
        vehicle={{
          id: a.id,
          name: a.name,
          identifier: a.identifier,
          mine: !!a.ownerMemberId,
        }}
      />
      <Card className="danger vform">
        <SectionHead title={t('vehicle.remove')} />
        <p className="muted small">{t('vehicle.removeBody')}</p>
        <div>
          <InlineAction
            action={deleteAssetAction}
            hidden={{ id: a.id }}
            label={t('vehicle.remove')}
            variant="danger"
            confirm={t('vehicle.removeConfirm', { name: a.name })}
          />
        </div>
      </Card>
    </div>
  );
}
