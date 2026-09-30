import { daysBetween } from '@/lib/dates';
import { dueNow, paysByInstalments, type WithInstalments } from '@/lib/instalments';

/** What a bill's (or instalment's) status is, for a chip: the UI gives it words. */
type BillStatusKey = 'paid' | 'overdue' | 'today' | 'tomorrow' | 'soon' | 'due';

export interface BillStatus {
  key: BillStatusKey;
  tone: 'ok' | 'bad' | 'warn' | 'neutral';
  /** Days until due (negative once overdue); 0 when paid. */
  days: number;
  dueDate: string;
}

/** Paid, overdue, due today, tomorrow, within a week (warn), or later. */
export function billStatus(paidAt: string | null, dueDate: string, today: string): BillStatus {
  if (paidAt) return { key: 'paid', tone: 'ok', days: 0, dueDate };
  const days = daysBetween(today, dueDate);
  if (days < 0) return { key: 'overdue', tone: 'bad', days, dueDate };
  if (days === 0) return { key: 'today', tone: 'warn', days, dueDate };
  if (days === 1) return { key: 'tomorrow', tone: 'warn', days, dueDate };
  if (days <= 7) return { key: 'soon', tone: 'warn', days, dueDate };
  return { key: 'due', tone: 'neutral', days, dueDate };
}

/**
 * Where a bill stands as one line: what is due to the provider next (the next
 * unpaid instalment when paying by instalments, else the whole bill), its
 * status, and the instalment it is. A bill is paid once the provider has the
 * lot (every instalment, or the bill itself).
 */
export function billDue(
  b: WithInstalments & { paidToProviderAt: string | null },
  today: string,
): { status: BillStatus; amountMinor: number; instalment: { n: number; of: number } | null } {
  const due = dueNow(b);
  const byInstalments = paysByInstalments(b);
  const paidAt = byInstalments
    ? b.instalments.every((i) => i.paidToProviderAt)
      ? (b.instalments.at(-1)!.paidToProviderAt ?? b.paidToProviderAt)
      : null
    : b.paidToProviderAt;
  return {
    status: billStatus(paidAt, due.dueDate, today),
    amountMinor: due.amountMinor,
    instalment: due.seq === null ? null : { n: due.seq, of: due.of },
  };
}
