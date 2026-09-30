import { getTranslations } from 'next-intl/server';
import { listAssets } from '@/lib/assets';
import { assetKindOf, isGroupedCategory } from '@/lib/service-categories';
import type { ServiceWithType } from '@/lib/services';
import type { BillFormService } from './bill-form';

/**
 * The bill form's service list: a sub-service reads "Subscriptions ›
 * Netflix" or "Vehicles › Registration", someone's own "· only you".
 */
export async function formServices(services: ServiceWithType[]): Promise<BillFormService[]> {
  const t = await getTranslations('bills');
  const ta = await getTranslations('main');
  return services.map((s) => ({
    id: s.id,
    name: `${
      isGroupedCategory(s.type.category)
        ? `${ta(`main.${s.type.category}`)} › `
        : s.type.hasSubServices
          ? `${s.type.label} › `
          : ''
    }${s.name}${s.ownerMemberId ? ` · ${t('tile.onlyYou')}` : ''}`,
    provider: s.provider,
    usageUnit: s.usageUnit,
    cadence: s.cadence,
    recurring: !!s.recurringSince,
    kind: assetKindOf(s.type.category),
  }));
}

/** The vehicles and policies this member sees, for the form's "Vehicle" field. */
export async function formAssets(householdId: string, memberId: string) {
  const ta = await getTranslations('main');
  return listAssets(householdId, { viewer: memberId }).map((a) => ({
    id: a.id,
    kind: a.kind,
    name: a.ownerMemberId ? `${a.name} · ${ta('yours')}` : a.name,
  }));
}
