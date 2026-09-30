import type { Bill, BillInstalment } from '@/db/schema';
import { isAdmin } from '@/lib/roles';

/** A bill with the instalments it offers (in order); empty when it offers none. */
export type WithInstalments = Pick<Bill, 'amountMinor' | 'dueDate' | 'paymentPlan'> & {
  instalments: Pick<BillInstalment, 'seq' | 'dueDate' | 'amountMinor' | 'paidToProviderAt'>[];
};

/** The household has chosen to pay this bill by instalments. */
export const paysByInstalments = (b: WithInstalments): boolean =>
  b.paymentPlan === 'instalments' && b.instalments.length > 0;

/**
 * What a bill has due: the bill itself, or, paid by instalments, each
 * instalment, with its due date and whether it's paid. Every money figure by
 * month counts these in full in the month they're due.
 */
export function dueParts(
  b: WithInstalments & { paidToProviderAt: string | null },
): { amountMinor: number; dueDate: string; paidAt: string | null; seq: number }[] {
  return paysByInstalments(b)
    ? b.instalments.map((i) => ({
        amountMinor: i.amountMinor,
        dueDate: i.dueDate,
        paidAt: i.paidToProviderAt,
        seq: i.seq,
      }))
    : [{ amountMinor: b.amountMinor, dueDate: b.dueDate, paidAt: b.paidToProviderAt, seq: 0 }];
}

/**
 * Who chooses how a bill is paid (in full or by instalments): for a personal
 * bill its owner; for the household's, an admin or the service's payer.
 */
export function canChoosePlan(
  me: { id: string; role: string },
  b: { ownerMemberId: string | null; service: { payerMemberId: string | null } },
): boolean {
  return b.ownerMemberId
    ? b.ownerMemberId === me.id
    : isAdmin(me) || b.service.payerMemberId === me.id;
}

/**
 * Why the payment plan can no longer be switched, or null: switching re-splits
 * the bill, so not once a housemate has paid a share ('shares') or a payment
 * to the provider is recorded ('provider').
 */
export function planLock(b: {
  paidToProviderAt: string | null;
  shares: { paidAt: string | null; paidMethod: string | null }[];
  instalments: { paidToProviderAt: string | null }[];
}): 'shares' | 'provider' | null {
  if (b.shares.some((s) => s.paidAt && s.paidMethod !== 'payer')) return 'shares';
  if (b.paidToProviderAt || b.instalments.some((i) => i.paidToProviderAt)) return 'provider';
  return null;
}

/** The bill offers instalments and nobody has said yet how they'll pay it. */
export const planUndecided = (b: WithInstalments): boolean =>
  b.instalments.length > 0 && b.paymentPlan === null;

/**
 * What is due to the provider next: the next unpaid instalment when paying by
 * instalments, otherwise the whole bill. `of` is how many instalments there are.
 */
export function dueNow(b: WithInstalments): {
  amountMinor: number;
  dueDate: string;
  seq: number | null;
  of: number;
} {
  if (!paysByInstalments(b))
    return { amountMinor: b.amountMinor, dueDate: b.dueDate, seq: null, of: 0 };
  const next = b.instalments.find((i) => !i.paidToProviderAt) ?? b.instalments.at(-1)!;
  return {
    amountMinor: next.amountMinor,
    dueDate: next.dueDate,
    seq: next.seq,
    of: b.instalments.length,
  };
}

/** The bill's due date while paying by instalments: the next unpaid one, else the last. */
export function instalmentDueDate(instalments: WithInstalments['instalments']): string {
  return (instalments.find((i) => !i.paidToProviderAt) ?? instalments.at(-1)!).dueDate;
}

/** When a member's share is due: its instalment's date, else the bill's. */
export const shareDueDate = (s: { dueDate: string | null }, b: { dueDate: string }): string =>
  s.dueDate ?? b.dueDate;

/** What is still to be paid to the provider on a bill (by instalments, the unpaid ones). */
export function unpaidMinor(b: WithInstalments & { paidToProviderAt: string | null }): number {
  if (b.paidToProviderAt) return 0;
  if (!paysByInstalments(b)) return b.amountMinor;
  return b.instalments.filter((i) => !i.paidToProviderAt).reduce((s, i) => s + i.amountMinor, 0);
}

/**
 * Can the household still choose to pay in full? Only up to the notice's
 * pay-in-full date; after that they're on instalments for good.
 */
export const fullPaymentOpen = (b: { fullDueDate: string | null }, today: string): boolean =>
  !!b.fullDueDate && today <= b.fullDueDate;
