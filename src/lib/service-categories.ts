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
 * sub-services (Vehicles → Registration, Car insurance…; Health → Health
 * insurance, Ambulance cover), and the things their bills are filed under:
 * vehicles or policies (src/lib/assets.ts).
 */
const CATEGORY_ASSETS = { vehicle: 'vehicle', health: 'policy' } as const;
export type GroupedCategory = keyof typeof CATEGORY_ASSETS;

/** The icon a grouped category's main service wears. */
export const CATEGORY_ICONS: Record<GroupedCategory, string> = { vehicle: 'car', health: 'heart' };

export function isGroupedCategory(
  category: string | null | undefined,
): category is GroupedCategory {
  return !!category && category in CATEGORY_ASSETS;
}

/** The kind of thing a category's bills are filed under, or null for categories without. */
export function assetKindOf(category: string | null | undefined): 'vehicle' | 'policy' | null {
  return isGroupedCategory(category) ? CATEGORY_ASSETS[category] : null;
}

/** The category whose bills are filed under this kind of thing. */
export function categoryOfKind(kind: 'vehicle' | 'policy'): GroupedCategory {
  return kind === 'vehicle' ? 'vehicle' : 'health';
}

/** Types of the categories that are main services, by category (Vehicles, then Health). */
export function groupedCategoryTypes<T extends { category?: string | null }>(
  types: T[],
): { category: GroupedCategory; types: T[] }[] {
  return (Object.keys(CATEGORY_ASSETS) as GroupedCategory[])
    .map((category) => ({ category, types: types.filter((ty) => ty.category === category) }))
    .filter((g) => g.types.length > 0);
}
