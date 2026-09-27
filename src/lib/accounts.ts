import { and, eq, isNull } from 'drizzle-orm';
import { getDb, type Db } from '@/db/client';
import { account, household, member, type Account, type Member } from '@/db/schema';
import { normaliseEmail } from '@/lib/auth/tokens';
import { operatorEmails } from '@/lib/env';
import { ulid } from '@/lib/ids';

export function getAccount(id: string, db: Db = getDb()): Account | null {
  return db.select().from(account).where(eq(account.id, id)).get() ?? null;
}

export function getAccountByEmail(email: string, db: Db = getDb()): Account | null {
  return (
    db
      .select()
      .from(account)
      .where(eq(account.email, normaliseEmail(email)))
      .get() ?? null
  );
}

/** Operators run the install (software updates, mailbox polling). Set by OPERATOR_EMAILS. */
export function isOperator(a: Pick<Account, 'email'> | null | undefined): boolean {
  return !!a && operatorEmails().includes(a.email);
}

/**
 * The account for a verified email, created on first sign-in. With Google, the
 * subject id is recorded on first use and must match afterwards.
 */
export function signInAccount(
  input: { email: string; name?: string | null; googleSub?: string | null },
  db: Db = getDb(),
): Account {
  const email = normaliseEmail(input.email);
  const now = new Date().toISOString();
  const bySub = input.googleSub
    ? db.select().from(account).where(eq(account.googleSub, input.googleSub)).get()
    : undefined;
  const existing = bySub ?? getAccountByEmail(email, db);
  if (existing) {
    if (input.googleSub && existing.googleSub && existing.googleSub !== input.googleSub)
      throw new Error('This email is linked to a different Google account');
    db.update(account)
      .set({
        lastSignInAt: now,
        updatedAt: now,
        ...(input.googleSub && !existing.googleSub ? { googleSub: input.googleSub } : {}),
      })
      .where(eq(account.id, existing.id))
      .run();
    return getAccount(existing.id, db)!;
  }
  const row: Account = {
    id: ulid(),
    email,
    name: input.name?.trim() || email.split('@')[0]!,
    googleSub: input.googleSub ?? null,
    lastSignInAt: now,
    createdAt: now,
    updatedAt: now,
  };
  db.insert(account).values(row).run();
  return row;
}

export function renameAccount(id: string, name: string, db: Db = getDb()): void {
  db.update(account)
    .set({ name: name.trim(), updatedAt: new Date().toISOString() })
    .where(eq(account.id, id))
    .run();
}

/** Members linked to an account, oldest first. The alpha UI uses the first one. */
export function membershipsFor(accountId: string, db: Db = getDb()): Member[] {
  return db
    .select()
    .from(member)
    .where(eq(member.accountId, accountId))
    .orderBy(member.createdAt)
    .all();
}

/**
 * Owners of real (non-demo) households created before accounts existed. The
 * operator links one of these to their account once, confirming with its old PIN.
 */
export function unclaimedOwners(db: Db = getDb()): (Member & { householdName: string })[] {
  return db
    .select({ m: member, householdName: household.name })
    .from(member)
    .innerJoin(household, eq(member.householdId, household.id))
    .where(and(isNull(member.accountId), eq(member.role, 'owner'), eq(household.isDemo, false)))
    .all()
    .filter((r) => r.m.pinHash)
    .map((r) => ({ ...r.m, householdName: r.householdName }));
}

/** Attach an account to an existing member row (invite accepted, or legacy owner claimed). */
export function linkMember(
  memberId: string,
  accountId: string,
  email: string | null,
  db: Db = getDb(),
): void {
  db.update(member)
    .set({ accountId, ...(email ? { email } : {}), updatedAt: new Date().toISOString() })
    .where(and(eq(member.id, memberId), isNull(member.accountId)))
    .run();
}
