import { daysInclusive, overlapDays } from './dates';

export interface SplitMember {
  id: string;
  splitWeight: number;
  activeFrom: string;
  activeTo: string | null;
}

export interface SplitInput {
  amountMinor: number;
  periodStart: string;
  periodEnd: string;
  splitMode: 'equal' | 'weighted' | 'custom';
  members: SplitMember[];
  /** Only used for splitMode === 'custom'. Members missing from the map get weight 0. */
  customWeights?: Record<string, number>;
  /** Member who paid the provider; receives the rounding remainder and is auto-marked paid. */
  payerMemberId?: string | null;
}

export interface ShareResult {
  memberId: string;
  amountMinor: number;
  basisWeight: number;
  basisDays: number;
  periodDays: number;
  /** True when this member paid the provider directly. */
  isPayer: boolean;
}

/**
 * Pure share calculation. Each member's share is
 *   weight × daysActiveInPeriod / periodDays, normalised across members,
 * with leftover minor units assigned to the payer (or the largest share) so
 * the shares always sum exactly to the bill.
 */
export function computeShares(input: SplitInput): ShareResult[] {
  const periodDays = daysInclusive(input.periodStart, input.periodEnd);
  if (periodDays <= 0) throw new Error('Billing period end must not be before start');

  const rows = input.members.map((m) => {
    const basisDays = overlapDays(input.periodStart, input.periodEnd, m.activeFrom, m.activeTo);
    let basisWeight: number;
    switch (input.splitMode) {
      case 'equal':
        basisWeight = 1;
        break;
      case 'weighted':
        basisWeight = m.splitWeight;
        break;
      case 'custom':
        basisWeight = input.customWeights?.[m.id] ?? 0;
        break;
    }
    const effective = basisWeight * (basisDays / periodDays);
    return { member: m, basisDays, basisWeight, effective };
  });

  const total = rows.reduce((s, r) => s + r.effective, 0);
  if (total <= 0) return [];

  const shares: ShareResult[] = rows
    .filter((r) => r.effective > 0)
    .map((r) => ({
      memberId: r.member.id,
      amountMinor: Math.floor((input.amountMinor * r.effective) / total),
      basisWeight: r.basisWeight,
      basisDays: r.basisDays,
      periodDays,
      isPayer: r.member.id === input.payerMemberId,
    }));

  const remainder = input.amountMinor - shares.reduce((s, r) => s + r.amountMinor, 0);
  if (remainder !== 0) {
    const target =
      shares.find((s) => s.isPayer) ??
      shares.reduce((a, b) => (b.amountMinor > a.amountMinor ? b : a));
    target.amountMinor += remainder;
  }
  return shares;
}

/** Fill a payment reference template such as "{service} {period} {member}". */
export function renderPaymentReference(
  template: string,
  vars: { service: string; period: string; member: string; ref?: string | null },
): string {
  return template
    .replace(/\{service\}/g, vars.service)
    .replace(/\{period\}/g, vars.period)
    .replace(/\{member\}/g, vars.member)
    .replace(/\{ref\}/g, vars.ref ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 18)
    .trim();
}
