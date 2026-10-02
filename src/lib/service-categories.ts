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
 * insurance, Ambulance cover), Lifestyle (Gym…) and Home & Property
 * (council rates, land tax, strata, home insurance, gardening, repairs…).
 * Subscriptions and Donations stay main services of their own, rent stands on
 * its own (see OWN_MAIN_SERVICES, STANDALONE_TYPES). Vehicles' bills are also filed under the
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

/**
 * "Something else" inside each main service (migration 0038): a physio under
 * Health, tolls under Vehicles. Whoever picks it wasn't sure which kind it
 * is, so a service of it takes any bill of its main service (typeFits).
 */
const SOMETHING_ELSE: Record<GroupedCategory, string> = {
  vehicle: 'vehicle_other',
  health: 'health_other',
  lifestyle: 'lifestyle_other',
  home: 'home_other',
};
const SOMETHING_ELSE_OF = new Map<string, GroupedCategory>(
  Object.entries(SOMETHING_ELSE).map(([c, slug]) => [slug, c as GroupedCategory]),
);
/** The main service this type is "Something else" in, or null. */
export const somethingElseIn = (slug: string): GroupedCategory | null =>
  SOMETHING_ELSE_OF.get(slug) ?? null;

export function isGroupedCategory(
  category: string | null | undefined,
): category is GroupedCategory {
  return (MAIN_CATEGORIES as readonly string[]).includes(category ?? '');
}

/**
 * Types that are a main service of their own even though their category is
 * one, holding a service each as sub-services: Subscriptions (Netflix,
 * Spotify) and Donations (a service per charity; owner, 2026-10-02).
 */
const OWN_MAIN_SERVICES = new Set(['subscriptions', 'donations']);

/** Types of a main service's category that stay on their own: rent is an everyday bill, not part of Home & Property. */
const STANDALONE_TYPES = new Set(['rent']);

/** Is this type one of a main service's sub-services (Registration under Vehicles, Council Rates under Home & Property)? */
export const inMainCategory = (ty: { slug: string; category?: string | null }): boolean =>
  isGroupedCategory(ty.category) &&
  !OWN_MAIN_SERVICES.has(ty.slug) &&
  !STANDALONE_TYPES.has(ty.slug);

/** Bills of this category are filed under vehicles; null for every other category. */
export function assetKindOf(category: string | null | undefined): 'vehicle' | null {
  return category === 'vehicle' ? 'vehicle' : null;
}

/**
 * The everyday bills, each on its own (never folded into a main service):
 * first in the nav and on the Services page until someone arranges them, and
 * "Essentials" is the name suggested for a group of them (src/lib/nav-layout.ts).
 */
const ESSENTIAL_TYPES = new Set(['internet', 'electricity', 'gas', 'water', 'phone', 'rent']);

export const isEssential = (ty: { slug: string }): boolean => ESSENTIAL_TYPES.has(ty.slug);

/** One choice on the Add a service page's first step: an everyday bill, a main service, or a type of its own. */
export interface TopChoice<T> {
  /** The type's slug, or "cat:<category>" for a main service. */
  key: string;
  essential: boolean;
  /** A main service's category, when it is one. */
  category: GroupedCategory | null;
  /** Its kinds: one for a type of its own; a main service's, "Something else" last. */
  types: T[];
}

/**
 * What the Add a service page offers first, laid out like the Services page:
 * the everyday bills, then the main services (Home & property, Health,
 * Lifestyle, Vehicles), Subscriptions and any other type, and "Other" last.
 */
export function topChoices<T extends { slug: string; category?: string | null }>(
  types: T[],
): TopChoice<T>[] {
  const own = (ty: T): TopChoice<T> => ({
    key: ty.slug,
    essential: isEssential(ty),
    category: null,
    types: [ty],
  });
  const mains = (['home', 'health', 'lifestyle', 'vehicle'] as const)
    .map((category): TopChoice<T> => {
      const kinds = types.filter((ty) => ty.category === category && inMainCategory(ty));
      const unsure = kinds.filter((ty) => somethingElseIn(ty.slug));
      return {
        key: `cat:${category}`,
        essential: false,
        category,
        types: [...kinds.filter((ty) => !somethingElseIn(ty.slug)), ...unsure],
      };
    })
    .filter((c) => c.types.length > 0);
  const rest = types.filter((ty) => !isEssential(ty) && !inMainCategory(ty));
  return [
    ...types.filter(isEssential).map(own),
    ...mains,
    ...rest.filter((ty) => ty.slug !== 'other').map(own),
    ...rest.filter((ty) => ty.slug === 'other').map(own),
  ];
}

/** The first-step choice a type belongs to. */
export const topKeyOf = (ty: { slug: string; category?: string | null }): string =>
  inMainCategory(ty) ? `cat:${ty.category}` : ty.slug;
