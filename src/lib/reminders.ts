import { and, eq, isNull } from 'drizzle-orm';
import { getDb, type Db } from '@/db/client';
import { bill, service, share, type Bill, type Share } from '@/db/schema';
import { daysUntil } from '@/lib/periods';

export type ReminderLevel = 'overdue' | 'due_soon' | 'upcoming';

export interface Reminder {
  share: Share;
  bill: Bill;
  serviceName: string;
  payerMemberId: string | null;
  daysUntilDue: number;
  level: ReminderLevel;
}

/**
 * In-app reminders for one member: their unpaid shares, ranked by urgency.
 * Overdue first, then due within `soonDays`, then the rest.
 */
export function remindersFor(
  householdId: string,
  memberId: string,
  today: string,
  soonDays = 7,
  db: Db = getDb(),
): Reminder[] {
  const rows = db
    .select()
    .from(share)
    .innerJoin(bill, eq(share.billId, bill.id))
    .innerJoin(service, eq(bill.serviceId, service.id))
    .where(
      and(eq(share.householdId, householdId), eq(share.memberId, memberId), isNull(share.paidAt)),
    )
    .all();
  return rows
    .map((r) => {
      const d = daysUntil(today, r.bill.dueDate);
      const level: ReminderLevel = d < 0 ? 'overdue' : d <= soonDays ? 'due_soon' : 'upcoming';
      return {
        share: r.share,
        bill: r.bill,
        serviceName: r.service.name,
        payerMemberId: r.service.payerMemberId,
        daysUntilDue: d,
        level,
      };
    })
    .sort((a, b) => a.daysUntilDue - b.daysUntilDue);
}

export function summariseReminders(rs: Reminder[]) {
  const overdue = rs.filter((r) => r.level === 'overdue');
  const soon = rs.filter((r) => r.level === 'due_soon');
  return {
    overdueCount: overdue.length,
    overdueMinor: overdue.reduce((s, r) => s + r.share.amountMinor, 0),
    soonCount: soon.length,
    soonMinor: soon.reduce((s, r) => s + r.share.amountMinor, 0),
    total: rs.length,
  };
}
