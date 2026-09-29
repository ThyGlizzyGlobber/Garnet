/**
 * How service types are grouped in pickers and lists, in this order. Stored on
 * each type (service_type.category); custom types are "other". Kept out of the
 * schema module so client components can use it.
 */
export const SERVICE_CATEGORIES = [
  'utilities',
  'home',
  'health',
  'vehicle',
  'lifestyle',
  'other',
] as const;

export type ServiceCategory = (typeof SERVICE_CATEGORIES)[number];
