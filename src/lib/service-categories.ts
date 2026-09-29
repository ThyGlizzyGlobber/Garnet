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
