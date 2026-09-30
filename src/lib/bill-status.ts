import { daysBetween } from '@/lib/dates';

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
