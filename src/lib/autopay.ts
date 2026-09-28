import { and, eq, isNull, lt } from 'drizzle-orm';
import { getDb, type Db } from '@/db/client';
import { bill, billInstalment, service } from '@/db/schema';
import { setInstalmentPaid } from '@/lib/bills';
import { todayIn } from '@/lib/dates';
import { listHouseholds } from '@/lib/households';

/**
 * Services the provider charges automatically: once a bill's due (debit) date
 * has passed with no payment problem reported, count it as paid to the
 * provider on that date. A later "payment failed" notice un-marks it.
 */
export function settleAutoPaidBills(now = new Date(), db: Db = getDb()): number {
  let settled = 0;
  for (const hh of listHouseholds(db)) {
    const today = todayIn(hh.timezone, now);
    const due = db
      .select({ id: bill.id, dueDate: bill.dueDate, paymentPlan: bill.paymentPlan })
      .from(bill)
      .innerJoin(service, eq(bill.serviceId, service.id))
      .where(
        and(
          eq(bill.householdId, hh.id),
          eq(service.autoPay, true),
          isNull(bill.paidToProviderAt),
          isNull(bill.alertKind),
          lt(bill.dueDate, today),
        ),
      )
      .all();
    for (const b of due) {
      if (b.paymentPlan === 'instalments') {
        // Each instalment is taken on its own date.
        const open = db
          .select()
          .from(billInstalment)
          .where(and(eq(billInstalment.billId, b.id), isNull(billInstalment.paidToProviderAt)))
          .all()
          .filter((i) => i.dueDate < today);
        for (const i of open)
          setInstalmentPaid(hh.id, b.id, i.seq, true, db, `${i.dueDate}T00:00:00Z`);
        if (open.length) settled++;
        continue;
      }
      settled += db
        .update(bill)
        .set({ paidToProviderAt: `${b.dueDate}T00:00:00Z`, updatedAt: now.toISOString() })
        .where(and(eq(bill.id, b.id), isNull(bill.paidToProviderAt)))
        .run().changes;
    }
  }
  return settled;
}
