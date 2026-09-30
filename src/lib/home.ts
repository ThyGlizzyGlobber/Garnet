import { getDb, type Db } from '@/db/client';
import type { Household } from '@/db/schema';
import { dueNow } from '@/lib/instalments';
import { nextMonth, projectMonth } from '@/lib/projections';
import { dashboardSummary, hasAnyBills, householdBalances, settlementRate } from '@/lib/stats';

/** So far this month, as a percentage of the month's estimate. */
const budgetPct = (soFar: number, estimate: number) =>
  estimate > 0 ? Math.round((soFar / estimate) * 100) : 0;

/**
 * The wall display's numbers (the kiosk on the iPad): a leaner Home for the
 * whole household, refreshed every minute. Null before the first bill.
 */
export function wallView(hh: Household, today: string, db: Db = getDb()) {
  if (!hasAnyBills(hh.id, db)) return null;
  const shared = hh.splitMode === 'shared';
  const s = dashboardSummary(hh.id, today, hh.fiscalYearStartMonth, db);
  const projected = projectMonth(hh.id, s.thisMonth.month, db);
  const next = projectMonth(hh.id, nextMonth(today), db);
  const nextBill = s.overdue[0] ?? s.upcoming[0] ?? null;
  return {
    shared,
    summary: s,
    budgetPct: budgetPct(s.thisMonth.total, projected.totalMinor),
    nextDue: nextBill
      ? { bill: nextBill, due: dueNow(nextBill), overdue: nextBill.daysUntilDue < 0 }
      : null,
    balances: shared ? householdBalances(hh.id, db, today) : [],
    settled: shared ? settlementRate(hh.id, s.thisMonth.month, db) : null,
    setAside: { month: next.month, each: next.setAsideEach },
  };
}
