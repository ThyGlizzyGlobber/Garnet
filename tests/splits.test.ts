import { describe, expect, it } from 'vitest';
import { computeShares, renderPaymentReference } from '@/lib/splits';

const period = { periodStart: '2026-06-14', periodEnd: '2026-07-13' }; // 30 days
const a = { id: 'a', splitWeight: 1, activeFrom: '2025-01-01', activeTo: null };
const b = { id: 'b', splitWeight: 1, activeFrom: '2025-01-01', activeTo: null };
const c = { id: 'c', splitWeight: 2, activeFrom: '2025-01-01', activeTo: null };

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

  it('uses custom weights and drops members with no weight', () => {
    const s = computeShares({
      amountMinor: 4000,
      ...period,
      splitMode: 'custom',
      members: [a, b, c],
      customWeights: { a: 3, b: 1 },
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
      renderPaymentReference('{ref}', { service: 'x', period: 'y', member: 'z', ref: '59259831' }),
    ).toBe('59259831');
  });
});
