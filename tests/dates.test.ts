import { describe, expect, it } from 'vitest';
import { addDays, daysInclusive, isIsoDate, overlapDays, todayIn } from '@/lib/dates';
import { ulid } from '@/lib/ids';

describe('dates', () => {
  it('counts inclusive days', () => {
    expect(daysInclusive('2026-06-14', '2026-07-13')).toBe(30);
    expect(daysInclusive('2026-01-01', '2026-01-01')).toBe(1);
  });
  it('computes overlap with open-ended ranges', () => {
    expect(overlapDays('2026-06-14', '2026-07-13', '2026-07-04', null)).toBe(10);
    expect(overlapDays('2026-06-14', '2026-07-13', '2025-01-01', '2026-06-01')).toBe(0);
    expect(overlapDays('2026-06-14', '2026-07-13', '2026-06-14', '2026-07-13')).toBe(30);
  });
  it('adds days across month ends', () => {
    expect(addDays('2026-06-30', 1)).toBe('2026-07-01');
  });
  it('validates ISO dates', () => {
    expect(isIsoDate('2026-02-30')).toBe(true); // JS Date rolls over; format check only
    expect(isIsoDate('14/06/2026')).toBe(false);
  });
  it('gives today in a timezone', () => {
    const d = new Date('2026-06-14T15:30:00Z'); // 01:30 next day in Melbourne (AEST +10)
    expect(todayIn('Australia/Melbourne', d)).toBe('2026-06-15');
    expect(todayIn('America/Los_Angeles', d)).toBe('2026-06-14');
  });
});

describe('ulid', () => {
  it('is 26 chars and time-sortable', () => {
    const a = ulid(1000);
    const b = ulid(2000);
    expect(a).toHaveLength(26);
    expect(a < b).toBe(true);
  });
});
