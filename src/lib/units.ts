/**
 * Unit registry. Usage is stored with the unit the bill used and can be
 * converted to a canonical unit per dimension for charts and comparisons.
 */
type Dimension = 'energy' | 'volume' | 'data' | 'count';

export interface UnitDef {
  key: string;
  label: string;
  dimension: Dimension;
  /** Multiply a quantity in this unit by this factor to get the dimension's canonical unit. */
  toCanonical: number;
}

const defs: UnitDef[] = [
  // energy → canonical kWh
  { key: 'kWh', label: 'kWh', dimension: 'energy', toCanonical: 1 },
  { key: 'MWh', label: 'MWh', dimension: 'energy', toCanonical: 1000 },
  { key: 'MJ', label: 'MJ', dimension: 'energy', toCanonical: 1 / 3.6 },
  { key: 'GJ', label: 'GJ', dimension: 'energy', toCanonical: 1000 / 3.6 },
  { key: 'therm', label: 'therm', dimension: 'energy', toCanonical: 29.3071 },
  { key: 'ccf', label: 'ccf (gas)', dimension: 'energy', toCanonical: 30.1 },
  // volume → canonical m³ (1 kL = 1 m³)
  { key: 'm3', label: 'm³', dimension: 'volume', toCanonical: 1 },
  { key: 'kL', label: 'kL', dimension: 'volume', toCanonical: 1 },
  { key: 'L', label: 'L', dimension: 'volume', toCanonical: 0.001 },
  { key: 'gal', label: 'gal (US)', dimension: 'volume', toCanonical: 0.00378541 },
  { key: 'ccf_water', label: 'ccf (water)', dimension: 'volume', toCanonical: 2.83168 },
  // data → canonical GB
  { key: 'GB', label: 'GB', dimension: 'data', toCanonical: 1 },
  { key: 'TB', label: 'TB', dimension: 'data', toCanonical: 1000 },
  // count
  { key: 'units', label: 'units', dimension: 'count', toCanonical: 1 },
];

export const UNITS: ReadonlyMap<string, UnitDef> = new Map(defs.map((d) => [d.key, d]));

const CANONICAL: Record<Dimension, string> = {
  energy: 'kWh',
  volume: 'm3',
  data: 'GB',
  count: 'units',
};

export function listUnits(): UnitDef[] {
  return defs;
}

export function unitLabel(key: string | null | undefined): string {
  if (!key) return '';
  return UNITS.get(key)?.label ?? key;
}

/** Convert a quantity between two units of the same dimension. Returns null if incompatible/unknown. */
export function convertUnit(quantity: number, from: string, to: string): number | null {
  const a = UNITS.get(from);
  const b = UNITS.get(to);
  if (!a || !b || a.dimension !== b.dimension) return null;
  return (quantity * a.toCanonical) / b.toCanonical;
}

/** Normalise to the dimension's canonical unit. Unknown units pass through unchanged. */
export function toCanonical(quantity: number, unit: string): { quantity: number; unit: string } {
  const def = UNITS.get(unit);
  if (!def) return { quantity, unit };
  return { quantity: quantity * def.toCanonical, unit: CANONICAL[def.dimension] };
}
