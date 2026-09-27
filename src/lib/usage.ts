import { and, eq, sql } from 'drizzle-orm';
import { getDb, type Db } from '@/db/client';
import { usage } from '@/db/schema';
import { getEnv } from '@/lib/env';

export const AI_READ = 'ai_read';

function monthOf(now: number): string {
  return new Date(now).toISOString().slice(0, 7);
}

export function usageCount(
  householdId: string,
  kind: string,
  db: Db = getDb(),
  now = Date.now(),
): number {
  return (
    db
      .select({ count: usage.count })
      .from(usage)
      .where(
        and(
          eq(usage.householdId, householdId),
          eq(usage.month, monthOf(now)),
          eq(usage.kind, kind),
        ),
      )
      .get()?.count ?? 0
  );
}

export function recordUsage(
  householdId: string,
  kind: string,
  db: Db = getDb(),
  now = Date.now(),
): void {
  db.insert(usage)
    .values({ householdId, month: monthOf(now), kind, count: 1 })
    .onConflictDoUpdate({
      target: [usage.householdId, usage.month, usage.kind],
      set: { count: sql`${usage.count} + 1` },
    })
    .run();
}

/** AI reads used and allowed this month for a household. */
export function aiAllowance(householdId: string, db: Db = getDb(), now = Date.now()) {
  const limit = getEnv().AI_MONTHLY_LIMIT;
  const used = usageCount(householdId, AI_READ, db, now);
  return { used, limit, left: Math.max(0, limit - used) };
}
