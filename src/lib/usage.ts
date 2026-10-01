import { and, eq, sql } from 'drizzle-orm';
import { getDb, type Db } from '@/db/client';
import { household, usage } from '@/db/schema';
import { getEnv } from '@/lib/env';

export const AI_READ = 'ai_read';

/** Usage is counted per UTC calendar month (YYYY-MM). */
function usageMonth(now: number): string {
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
          eq(usage.month, usageMonth(now)),
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
    .values({ householdId, month: usageMonth(now), kind, count: 1 })
    .onConflictDoUpdate({
      target: [usage.householdId, usage.month, usage.kind],
      set: { count: sql`${usage.count} + 1` },
    })
    .run();
}

/**
 * A household's cap (SCOPE-console.md C-D4): null = the install's
 * AI_MONTHLY_LIMIT, 0 = no cap, otherwise a number a month. Set from the
 * console; a one-off step gave the developers' own households no cap.
 */
function capFor(householdId: string, db: Db = getDb()): number | null {
  const row = db
    .select({ aiCap: household.aiCap })
    .from(household)
    .where(eq(household.id, householdId))
    .get();
  return row?.aiCap ?? null;
}

/** AI reads used and allowed this month for a household (limit null = no cap). */
export function aiAllowance(
  householdId: string,
  db: Db = getDb(),
  now = Date.now(),
): { used: number; limit: number | null; left: number } {
  const used = usageCount(householdId, AI_READ, db, now);
  const own = capFor(householdId, db);
  // The household's own 0 means no cap; the install's limit of 0 means no reads.
  if (own === 0) return { used, limit: null, left: Number.POSITIVE_INFINITY };
  const limit = own ?? getEnv().AI_MONTHLY_LIMIT;
  return { used, limit, left: Math.max(0, limit - used) };
}
