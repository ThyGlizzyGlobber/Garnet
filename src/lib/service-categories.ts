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
 * insurance, Ambulance cover), Lifestyle (Gym, Donations…) and Home &
 * property (strata, home insurance, gardening, cleaning, repairs…).
 * Subscriptions stays its own main service, rent and council rates stand on
 * their own (see OWN_MAIN_SERVICES, STANDALONE_TYPES). Vehicles' bills are also filed under the
 * household's vehicles (src/lib/assets.ts).
 */
const MAIN_CATEGORIES = ['vehicle', 'health', 'lifestyle', 'home'] as const;
export type GroupedCategory = (typeof MAIN_CATEGORIES)[number];

/** The icon a grouped category's main service wears. */
export const CATEGORY_ICONS: Record<GroupedCategory, string> = {
  vehicle: 'car',
  health: 'heart',
  lifestyle: 'sun',
  home: 'building',
};

/**
 * The colour each main service wears, its own and unlike any other
 * top-level entry's (src/lib/palette.ts); the parts inside it wear shades
 * of it (migration 0037).
 */
export const CATEGORY_COLOURS: Record<GroupedCategory, string> = {
  vehicle: '#5b6f8a',
  health: '#e34948',
  lifestyle: '#7a9f12',
  home: '#9a6a3a',
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

/**
 * Types of a main service's category that stay on their own: rent and
 * council rates are everyday bills, not parts of Home & property.
 */
const STANDALONE_TYPES = new Set(['rent', 'council_rates']);

/** Is this type one of a main service's sub-services (Registration under Vehicles, Gym under Lifestyle)? */
export const inMainCategory = (ty: { slug: string; category?: string | null }): boolean =>
  isGroupedCategory(ty.category) &&
  !OWN_MAIN_SERVICES.has(ty.slug) &&
  !STANDALONE_TYPES.has(ty.slug);

/** Bills of this category are filed under vehicles; null for every other category. */
export function assetKindOf(category: string | null | undefined): 'vehicle' | null {
  return category === 'vehicle' ? 'vehicle' : null;
}
