import { describe, expect, it } from 'vitest';
import {
  addMonths,
  allocateToMonths,
  daysUntil,
  fiscalYearBounds,
  lastMonths,
  monthBounds,
} from '@/lib/periods';
import { anomalyNote, detectAnomaly } from '@/lib/anomaly';

describe('periods', () => {
  it('month bounds and arithmetic', () => {
    expect(monthBounds('2026-02')).toEqual({ start: '2026-02-01', end: '2026-02-28' });
    expect(addMonths('2026-11', 3)).toBe('2027-02');
    expect(lastMonths('2026-03', 3)).toEqual(['2026-01', '2026-02', '2026-03']);
  });
  it('fiscal year from July', () => {
    expect(fiscalYearBounds('2026-09-24', 7)).toEqual({
      start: '2026-07-01',
      end: '2027-06-30',
      label: '2026–27',
    });
    expect(fiscalYearBounds('2026-03-01', 7)).toEqual({
      start: '2025-07-01',
      end: '2026-06-30',
      label: '2025–26',
    });
    expect(fiscalYearBounds('2026-03-01', 1).label).toBe('2026');
  });
  it('allocates a bill across months by days and sums exactly', () => {
    const a = allocateToMonths(12900, '2026-06-14', '2026-07-13'); // 17 days June, 13 days July
    expect(a.map((x) => x.month)).toEqual(['2026-06', '2026-07']);
    expect(a[0]?.days).toBe(17);
    expect(a.reduce((s, x) => s + x.minor, 0)).toBe(12900);
    expect(a[0]?.minor).toBe(7310);
  });
  it('keeps a single-month bill whole', () => {
    expect(allocateToMonths(500, '2026-09-01', '2026-09-30')).toEqual([
      { month: '2026-09', days: 30, minor: 500 },
    ]);
  });
  it('spreads a quarter across three months', () => {
    const a = allocateToMonths(90000, '2026-07-01', '2026-09-30');
    expect(a).toHaveLength(3);
    expect(a.reduce((s, x) => s + x.minor, 0)).toBe(90000);
  });
  it('days until', () => {
    expect(daysUntil('2026-09-24', '2026-09-28')).toBe(4);
    expect(daysUntil('2026-09-24', '2026-09-20')).toBe(-4);
  });
});

describe('anomaly detection', () => {
  const monthly = (amt: number, m: string) => ({
    amountMinor: amt,
    periodStart: `${m}-01`,
    periodEnd: `${m}-28`,
  });
  it('needs history', () => {
    expect(detectAnomaly(monthly(99999, '2026-03'), [monthly(100, '2026-01')]).isAnomaly).toBe(
      false,
    );
  });
  it('flags a 40% jump and explains it', () => {
    const r = detectAnomaly(monthly(14000, '2026-04'), [
      monthly(10000, '2026-01'),
      monthly(10000, '2026-02'),
      monthly(10000, '2026-03'),
    ]);
    expect(r.isAnomaly).toBe(true);
    expect(r.ratio).toBeCloseTo(1.4, 5);
    expect(anomalyNote(r.ratio!)).toBe('40% above your usual daily cost for this service');
  });
  it('ignores a small change', () => {
    expect(
      detectAnomaly(monthly(11000, '2026-04'), [
        monthly(10000, '2026-01'),
        monthly(10000, '2026-02'),
      ]).isAnomaly,
    ).toBe(false);
  });
  it('compares per day so a quarterly bill after monthly ones is fine', () => {
    const q = { amountMinor: 30000, periodStart: '2026-04-01', periodEnd: '2026-06-24' }; // ~85 days ≈ 353/day
    expect(detectAnomaly(q, [monthly(10000, '2026-01'), monthly(10000, '2026-02')]).isAnomaly).toBe(
      false,
    ); // 357/day
  });
});
