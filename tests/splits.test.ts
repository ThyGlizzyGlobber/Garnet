import { describe, expect, it } from 'vitest';
import { computeShares, renderPaymentReference } from '@/lib/splits';

const period = { periodStart: '2026-06-14', periodEnd: '2026-07-13' }; // 30 days
const a = { id: 'a', splitWeight: 1, activeFrom: '2025-01-01', activeTo: null };
const b = { id: 'b', splitWeight: 1, activeFrom: '2025-01-01', activeTo: null };
const c = { id: 'c', splitWeight: 2, activeFrom: '2025-01-01', activeTo: null };

const shareOf = (s: ReturnType<typeof computeShares>) =>
  Object.fromEntries(s.map((x) => [x.memberId, x.amountMinor]));

describe('splitting by percentage and set amounts', () => {
  it('splits by percentage: 40% for the big room, 30% each for the others', () => {
    const s = computeShares({
      amountMinor: 100000,
      ...period,
      splitMode: 'percent',
      members: [a, b, c],
      customWeights: { a: 40, b: 30, c: 30 },
    });
    expect(shareOf(s)).toEqual({ a: 40000, b: 30000, c: 30000 });
  });

  it('leaves out anyone at 0%, and shares a leaver’s part by the others’ percentages', () => {
    const left = { ...b, activeTo: '2026-06-28' }; // half the period
    const s = computeShares({
      amountMinor: 100000,
      ...period,
      splitMode: 'percent',
      members: [a, left, c],
      customWeights: { a: 50, b: 50 },
    });
    expect(shareOf(s)).toEqual({ a: 66667, b: 33333 });
  });

  it('set amounts: each pays theirs, and those left blank share the rest evenly', () => {
    const s = computeShares({
      amountMinor: 100000,
      ...period,
      splitMode: 'fixed',
      members: [a, b, c],
      fixedAmounts: { a: 40000 },
    });
    expect(shareOf(s)).toEqual({ a: 40000, b: 30000, c: 30000 });
  });

  it('set amounts for everyone: a bigger or smaller bill moves everyone in proportion', () => {
    const s = computeShares({
      amountMinor: 110000,
      ...period,
      splitMode: 'fixed',
      members: [a, b, c],
      fixedAmounts: { a: 40000, b: 30000, c: 30000 },
    });
    expect(shareOf(s)).toEqual({ a: 44000, b: 33000, c: 33000 });
  });

  it('set amounts above the bill are scaled down and nobody else pays', () => {
    const s = computeShares({
      amountMinor: 50000,
      ...period,
      splitMode: 'fixed',
      members: [a, b, c],
      fixedAmounts: { a: 60000, b: 40000 },
    });
    expect(shareOf(s)).toEqual({ a: 30000, b: 20000 });
  });

  it('0 means someone pays nothing', () => {
    const s = computeShares({
      amountMinor: 90000,
      ...period,
      splitMode: 'fixed',
      members: [a, b, c],
      fixedAmounts: { a: 30000, c: 0 },
    });
    expect(shareOf(s)).toEqual({ a: 30000, b: 60000 });
  });

  it('an instalment pays its part of each set amount', () => {
    const s = computeShares({
      amountMinor: 25000, // one of four instalments of a $1,000 bill
      referenceAmountMinor: 100000,
      ...period,
      splitMode: 'fixed',
      members: [a, b, c],
      fixedAmounts: { a: 40000 },
    });
    expect(shareOf(s)).toEqual({ a: 10000, b: 7500, c: 7500 });
  });
});

describe('computeShares', () => {
  it('splits equally and sums exactly to the bill', () => {
    const s = computeShares({
      amountMinor: 12900,
      ...period,
      splitMode: 'equal',
      members: [a, b, c],
    });
    expect(s.map((x) => x.amountMinor).sort()).toEqual([4300, 4300, 4300]);
    expect(s.reduce((t, x) => t + x.amountMinor, 0)).toBe(12900);
  });

  it('gives the rounding remainder to the payer', () => {
    const s = computeShares({
      amountMinor: 10000,
      ...period,
      splitMode: 'equal',
      members: [a, b, c],
      payerMemberId: 'b',
    });
    const byId = Object.fromEntries(s.map((x) => [x.memberId, x]));
    expect(byId.a?.amountMinor).toBe(3333);
    expect(byId.b?.amountMinor).toBe(3334);
    expect(byId.b?.isPayer).toBe(true);
    expect(byId.c?.amountMinor).toBe(3333);
  });

  it('gives the remainder to the largest share when there is no payer', () => {
    const s = computeShares({
      amountMinor: 10000,
      ...period,
      splitMode: 'weighted',
      members: [a, c],
    });
    const byId = Object.fromEntries(s.map((x) => [x.memberId, x]));
    expect(byId.a?.amountMinor).toBe(3333);
    expect(byId.c?.amountMinor).toBe(6667);
  });

  it('uses member weights in weighted mode', () => {
    const s = computeShares({
      amountMinor: 3000,
      ...period,
      splitMode: 'weighted',
      members: [a, c],
    });
    const byId = Object.fromEntries(s.map((x) => [x.memberId, x]));
    expect(byId.a?.amountMinor).toBe(1000);
    expect(byId.c?.amountMinor).toBe(2000);
  });

  it('uses percentages and drops members with none', () => {
    const s = computeShares({
      amountMinor: 4000,
      ...period,
      splitMode: 'percent',
      members: [a, b, c],
      customWeights: { a: 75, b: 25 },
    });
    expect(s.map((x) => x.memberId).sort()).toEqual(['a', 'b']);
    expect(s.find((x) => x.memberId === 'a')?.amountMinor).toBe(3000);
  });

  it('pro-rates a member who moved in mid-period', () => {
    const mover = { id: 'm', splitWeight: 1, activeFrom: '2026-07-04', activeTo: null }; // 10 of 30 days
    const s = computeShares({
      amountMinor: 12000,
      ...period,
      splitMode: 'equal',
      members: [a, mover],
    });
    const byId = Object.fromEntries(s.map((x) => [x.memberId, x]));
    // a: 1.0, m: 1/3 → a gets 3/4, m gets 1/4
    expect(byId.a?.amountMinor).toBe(9000);
    expect(byId.m?.amountMinor).toBe(3000);
    expect(byId.m?.basisDays).toBe(10);
    expect(byId.m?.periodDays).toBe(30);
  });

  it('excludes a member who moved out before the period', () => {
    const gone = { id: 'g', splitWeight: 1, activeFrom: '2025-01-01', activeTo: '2026-05-31' };
    const s = computeShares({
      amountMinor: 12900,
      ...period,
      splitMode: 'equal',
      members: [a, gone],
    });
    expect(s).toHaveLength(1);
    expect(s[0]?.amountMinor).toBe(12900);
  });

  it('returns no shares when nobody is active', () => {
    const gone = { id: 'g', splitWeight: 1, activeFrom: '2025-01-01', activeTo: '2026-05-31' };
    expect(
      computeShares({ amountMinor: 100, ...period, splitMode: 'equal', members: [gone] }),
    ).toEqual([]);
  });

  it('rejects an inverted period', () => {
    expect(() =>
      computeShares({
        amountMinor: 100,
        periodStart: '2026-07-13',
        periodEnd: '2026-06-14',
        splitMode: 'equal',
        members: [a],
      }),
    ).toThrow();
  });
});

describe('renderPaymentReference', () => {
  it('fills the template and caps at 18 chars', () => {
    expect(
      renderPaymentReference('{service} {period} {member}', {
        service: 'Internet',
        period: 'Jul26',
        member: 'Bejay',
      }),
    ).toBe('Internet Jul26 Bej');
    expect(
      renderPaymentReference('{ref}', { service: 'x', period: 'y', member: 'z', ref: '50000001' }),
    ).toBe('50000001');
  });
});
