import { and, eq, sql } from 'drizzle-orm';
import { getDb, type Db } from '@/db/client';
import { account, member, usage } from '@/db/schema';
import { getEnv, operatorEmails } from '@/lib/env';

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

/**
 * The install's operator (OPERATOR_EMAILS) reads without a monthly cap in any
 * household they belong to: it's their own API key, and they test with a
 * year of bills at a time. Everyone else keeps AI_MONTHLY_LIMIT.
 */
export function isUncapped(householdId: string, db: Db = getDb()): boolean {
  const operators = operatorEmails();
  if (!operators.length) return false;
  return db
    .select({ email: account.email })
    .from(member)
    .innerJoin(account, eq(member.accountId, account.id))
    .where(eq(member.householdId, householdId))
    .all()
    .some((r) => operators.includes(r.email.toLowerCase()));
}

/** AI reads used and allowed this month for a household (limit null = no cap). */
export function aiAllowance(
  householdId: string,
  db: Db = getDb(),
  now = Date.now(),
): { used: number; limit: number | null; left: number } {
  const used = usageCount(householdId, AI_READ, db, now);
  if (isUncapped(householdId, db)) return { used, limit: null, left: Number.POSITIVE_INFINITY };
  const limit = getEnv().AI_MONTHLY_LIMIT;
  return { used, limit, left: Math.max(0, limit - used) };
}
