import type { Bill, BillInstalment } from '@/db/schema';

/** A bill with the instalments it offers (in order); empty when it offers none. */
export type WithInstalments = Pick<Bill, 'amountMinor' | 'dueDate' | 'paymentPlan'> & {
  instalments: Pick<BillInstalment, 'seq' | 'dueDate' | 'amountMinor' | 'paidToProviderAt'>[];
};

/** The household has chosen to pay this bill by instalments. */
export const paysByInstalments = (b: WithInstalments): boolean =>
  b.paymentPlan === 'instalments' && b.instalments.length > 0;

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
