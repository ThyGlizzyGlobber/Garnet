import type { Bill, Cadence } from '@/db/schema';
import { mean } from '@/lib/averages';

/** How many months one bill covers, for cadences that follow the calendar. */
export const MONTHS_PER_BILL: Partial<Record<Cadence, number>> = {
  monthly: 1,
  bimonthly: 2,
  quarterly: 3,
  annual: 12,
};

/** Same day `n` months later, clamped to the month's length. */
export function addCalendarMonths(date: string, n: number): string {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  const target = new Date(Date.UTC(y, m - 1 + n, 1));
  const last = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
  ).getUTCDate();
  target.setUTCDate(Math.min(d, last));
  return target.toISOString().slice(0, 10);
}

/**
 * A fixed price (internet, rent, a subscription): the latest bills, at least
 * two and up to three, all cost the same (within 1%), so the next one will
 * too, whatever number of days it covers. Their average, else null. Working
 * these out per day would make a 31-day month dearer than a 30-day one.
 */
export function fixedPrice(bills: Pick<Bill, 'amountMinor' | 'periodStart'>[]): number | null {
  const recent = [...bills].sort((a, b) => a.periodStart.localeCompare(b.periodStart)).slice(-3);
  if (recent.length < 2) return null;
  const amounts = recent.map((b) => b.amountMinor);
  const lo = Math.min(...amounts);
  const hi = Math.max(...amounts);
  if (hi <= 0 || hi - lo > hi * 0.01) return null;
  return Math.round(mean(amounts));
}
