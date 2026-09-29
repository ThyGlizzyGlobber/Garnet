import { daysInclusive, overlapDays } from './dates';

/** Percentages may be off by this much from 100 (rounding in what people type). */
const PERCENT_SLACK = 0.05;

/**
 * Why a split someone entered can't be saved, or null: percentages must add up
 * to 100, and set amounts need at least one person paying something. (The
 * maths itself reads percentages as proportions, so older data still splits.)
 */
export function splitProblem(
  mode: SplitInput['splitMode'],
  settings: { percents?: Record<string, number>; amounts?: Record<string, number> },
): { kind: 'percent-total'; total: number } | { kind: 'no-amounts' } | null {
  if (mode === 'percent') {
    const total = Object.values(settings.percents ?? {}).reduce((s, v) => s + v, 0);
    const rounded = Math.round(total * 100) / 100;
    return Math.abs(rounded - 100) < PERCENT_SLACK
      ? null
      : { kind: 'percent-total', total: rounded };
  }
  if (mode === 'fixed' && !Object.values(settings.amounts ?? {}).some((a) => a > 0))
    return { kind: 'no-amounts' };
  return null;
}

interface SplitMember {
  id: string;
  splitWeight: number;
  activeFrom: string;
  activeTo: string | null;
}

export interface SplitInput {
  amountMinor: number;
  periodStart: string;
  periodEnd: string;
  splitMode: 'equal' | 'weighted' | 'percent' | 'fixed';
  members: SplitMember[];
  /**
   * 'percent': each member's percentage (read as proportions).
   * Members missing from the map pay nothing.
   */
  customWeights?: Record<string, number>;
  /**
   * 'fixed': what each member pays of a bill, in minor units (0 = nothing).
   * Members without an amount share whatever is left, evenly.
   */
  fixedAmounts?: Record<string, number>;
  /**
   * 'fixed': the whole bill the amounts are for, when splitting only part of it
   * (an instalment, or a month's estimate). Defaults to amountMinor.
   */
  referenceAmountMinor?: number;
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
      case 'fixed':
        basisWeight = 1;
        break;
      case 'weighted':
        basisWeight = m.splitWeight;
        break;
      case 'percent':
        basisWeight = input.customWeights?.[m.id] ?? 0;
        break;
    }
    const effective = basisWeight * (basisDays / periodDays);
    return { member: m, basisDays, basisWeight, effective };
  });

  if (input.splitMode === 'fixed') fixedEffective(rows, input, periodDays);
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

/**
 * Set amounts: each member with an amount pays it (less for days they didn't
 * live there), and everyone without one shares what's left of the bill evenly.
 * When nobody is left to share it, or the amounts come to more than the bill,
 * the amounts are scaled to fit. Rewrites each row's `effective` (in minor
 * units of the reference bill; computeShares scales them to the part split).
 */
function fixedEffective(
  rows: { member: SplitMember; basisDays: number; basisWeight: number; effective: number }[],
  input: SplitInput,
  periodDays: number,
) {
  const reference = input.referenceAmountMinor ?? input.amountMinor;
  const amounts = input.fixedAmounts ?? {};
  let setTotal = 0;
  let restDays = 0;
  for (const r of rows) {
    const amount = amounts[r.member.id];
    if (amount === undefined) {
      restDays += r.basisDays;
      continue;
    }
    r.basisWeight = amount;
    r.effective = amount * (r.basisDays / periodDays);
    setTotal += r.effective;
  }
  const left = reference - setTotal;
  for (const r of rows) {
    if (amounts[r.member.id] !== undefined) continue;
    r.basisWeight = 0;
    r.effective = left > 0 && restDays > 0 ? (left * r.basisDays) / restDays : 0;
  }
  // Nobody set and nobody left to share it: fall back to even.
  if (setTotal <= 0 && restDays <= 0) for (const r of rows) r.effective = r.basisDays;
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
