/**
 * How service types are grouped in pickers and lists, in this order. Stored on
 * each type (service_type.category); custom types are "other". Kept out of the
 * schema module so client components can use it.
 */
const SERVICE_CATEGORIES = [
  'utilities',
  'home',
  'health',
  'vehicle',
  'lifestyle',
  'other',
] as const;

/**
 * Types grouped by category (Utilities, Home, Health, Vehicle, Lifestyle,
 * Other), in catalog order within each; empty groups left out.
 */
export function groupTypes<T extends { category?: string | null }>(types: T[]) {
  return SERVICE_CATEGORIES.map((category) => ({
    category,
    types: types.filter((ty) => (ty.category ?? 'other') === category),
  })).filter((g) => g.types.length > 0);
}

/**
 * Categories that are a main service of their own, holding their types as
 * sub-services: Vehicles (Registration, Car insurance…), Health (Health
 * insurance, Ambulance cover) and Lifestyle (Gym, Donations…). Subscriptions
 * stays its own main service (see OWN_MAIN_SERVICES). Vehicles' bills are also filed under the
 * household's vehicles (src/lib/assets.ts).
 */
const MAIN_CATEGORIES = ['vehicle', 'health', 'lifestyle'] as const;
export type GroupedCategory = (typeof MAIN_CATEGORIES)[number];

/** The icon a grouped category's main service wears. */
export const CATEGORY_ICONS: Record<GroupedCategory, string> = {
  vehicle: 'car',
  health: 'heart',
  lifestyle: 'sun',
};

export function isGroupedCategory(
  category: string | null | undefined,
): category is GroupedCategory {
  return (MAIN_CATEGORIES as readonly string[]).includes(category ?? '');
}

/**
 * Types that are a main service of their own even though their category is
 * one: Subscriptions has its own page, a list of every subscription.
 * (Donations, with a service per charity, sits under Lifestyle.)
 */
const OWN_MAIN_SERVICES = new Set(['subscriptions']);

/** Is this type one of a main service's sub-services (Registration under Vehicles, Gym under Lifestyle)? */
export const inMainCategory = (ty: { slug: string; category?: string | null }): boolean =>
  isGroupedCategory(ty.category) && !OWN_MAIN_SERVICES.has(ty.slug);

/** Bills of this category are filed under vehicles; null for every other category. */
export function assetKindOf(category: string | null | undefined): 'vehicle' | null {
  return category === 'vehicle' ? 'vehicle' : null;
}
