import { and, eq, isNull } from 'drizzle-orm';
import { getDb, type Db } from '@/db/client';
import { account, household, member, type Account, type Member } from '@/db/schema';
import { normaliseEmail } from '@/lib/auth/tokens';
import { operatorEmails } from '@/lib/env';
import { ulid } from '@/lib/ids';

export function getAccount(id: string, db: Db = getDb()): Account | null {
  return db.select().from(account).where(eq(account.id, id)).get() ?? null;
}

function getAccountByEmail(email: string, db: Db = getDb()): Account | null {
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

/**
 * Each member of a household with the addresses they use, lowercased: the one
 * their invitation went to and their sign-in email.
 */
function memberAddresses(householdId: string, db: Db): { memberId: string; addresses: string[] }[] {
  return db
    .select({ memberId: member.id, memberEmail: member.email, accountEmail: account.email })
    .from(member)
    .leftJoin(account, eq(member.accountId, account.id))
    .where(eq(member.householdId, householdId))
    .all()
    .map((r) => ({
      memberId: r.memberId,
      addresses: [r.memberEmail, r.accountEmail]
        .filter((e): e is string => !!e)
        .map((e) => e.toLowerCase()),
    }));
}

/**
 * Every address a household's members use. A signed bill forwarded from one
 * of these is the household's own doing, so it needs no per-service trust.
 */
export function householdEmails(householdId: string, db: Db = getDb()): Set<string> {
  return new Set(memberAddresses(householdId, db).flatMap((m) => m.addresses));
}

/** Every address the household's members use → the member, for looking up many at once. */
export function memberAddressBook(householdId: string, db: Db = getDb()): Map<string, string> {
  return new Map(
    memberAddresses(householdId, db).flatMap((m) => m.addresses.map((a) => [a, m.memberId])),
  );
}

/** A member's sign-in email; null until they've joined (emails only go to joined members). */
export function signInEmail(m: Pick<Member, 'accountId'>, db: Db = getDb()): string | null {
  return m.accountId ? (getAccount(m.accountId, db)?.email ?? null) : null;
}
