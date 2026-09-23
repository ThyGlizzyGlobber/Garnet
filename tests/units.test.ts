import { describe, expect, it } from 'vitest';
import { convertUnit, toCanonical, unitLabel } from '@/lib/units';

describe('units', () => {
  it('converts within a dimension', () => {
    expect(convertUnit(3.6, 'MJ', 'kWh')).toBeCloseTo(1, 6);
    expect(convertUnit(1, 'kL', 'm3')).toBe(1);
    expect(convertUnit(1, 'TB', 'GB')).toBe(1000);
  });
  it('refuses cross-dimension conversion', () => {
    expect(convertUnit(1, 'kWh', 'm3')).toBeNull();
    expect(convertUnit(1, 'nope', 'kWh')).toBeNull();
  });
  it('normalises to canonical units and passes unknown units through', () => {
    expect(toCanonical(36, 'MJ')).toEqual({ quantity: 10, unit: 'kWh' });
    expect(toCanonical(5, 'widgets')).toEqual({ quantity: 5, unit: 'widgets' });
  });
  it('labels units', () => {
    expect(unitLabel('m3')).toBe('m³');
    expect(unitLabel(null)).toBe('');
  });
});
