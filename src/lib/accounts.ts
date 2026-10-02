import { and, desc, eq, isNull } from 'drizzle-orm';
import { getDb, type Db } from '@/db/client';
import { account, household, member, type Account, type Member } from '@/db/schema';
import { markAllowedUsed } from '@/lib/access';
import { normaliseEmail } from '@/lib/auth/tokens';
import { developerEmails } from '@/lib/env';
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
export function isDeveloper(a: Pick<Account, 'email'> | null | undefined): boolean {
  return !!a && developerEmails().includes(a.email);
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
    pinHash: null,
    theme: 'auto',
    glass: 'auto',
    lastMemberId: null,
    lastSignInAt: now,
    avatarAt: null,
    createdAt: now,
    updatedAt: now,
  };
  db.insert(account).values(row).run();
  markAllowedUsed(email, db);
  return row;
}

/**
 * The name a person gave (Google's, or one typed later), or null when it was
 * only ever made up from their email. Screens greet by name or not at all;
 * nobody should be called "bejaysmith11".
 */
export function accountGivenName(a: Pick<Account, 'name' | 'email'>): string | null {
  const name = a.name.trim();
  if (!name || name.toLowerCase() === a.email.split('@')[0]!.toLowerCase()) return null;
  return name;
}

/** How an account signs in: Google once it has used it, otherwise an emailed code. */
export function signInMethod(a: Pick<Account, 'googleSub'>): 'google' | 'code' {
  return a.googleSub ? 'google' : 'code';
}

export interface AccountRecord {
  id: string;
  email: string;
  name: string | null;
  method: 'google' | 'code';
  createdAt: string;
  lastSignInAt: string | null;
  /** The households this account has joined, and the name it goes by in each. */
  households: { id: string; name: string; member: string }[];
}

/** Every account on the install, newest first, with the households each belongs to. */
export function listAccounts(db: Db = getDb()): AccountRecord[] {
  const rows = db.select().from(account).orderBy(desc(account.createdAt)).all();
  const links = db
    .select({
      accountId: member.accountId,
      memberName: member.name,
      hid: household.id,
      hname: household.name,
    })
    .from(member)
    .innerJoin(household, eq(member.householdId, household.id))
    .all();
  return rows.map((a) => ({
    id: a.id,
    email: a.email,
    name: accountGivenName(a),
    method: signInMethod(a),
    createdAt: a.createdAt,
    lastSignInAt: a.lastSignInAt,
    households: links
      .filter((l) => l.accountId === a.id)
      .map((l) => ({ id: l.hid, name: l.hname, member: l.memberName })),
  }));
}

/** Members linked to an account, oldest first: one per household they belong to. */
export function membershipsFor(accountId: string, db: Db = getDb()): Member[] {
  return db
    .select()
    .from(member)
    .where(eq(member.accountId, accountId))
    .orderBy(member.createdAt)
    .all();
}

/**
 * Which household to open (SCOPE-accounts.md D7): the one asked for when it is
 * theirs, else their primary household, else the one they were last in, else
 * the first they joined.
 */
export function pickMember(
  memberships: Member[],
  wanted: string | undefined,
  lastMemberId: string | null,
): Member | null {
  return (
    memberships.find((m) => m.id === wanted) ??
    memberships.find((m) => m.isPrimary) ??
    memberships.find((m) => m.id === lastMemberId) ??
    memberships[0] ??
    null
  );
}

function touchAccount(accountId: string, patch: Partial<Account>, db: Db): void {
  db.update(account)
    .set({ ...patch, updatedAt: new Date().toISOString() })
    .where(eq(account.id, accountId))
    .run();
}

/** The account's PIN (D2): one for the person, unlocking every household. */
export function setAccountPin(accountId: string, pinHash: string, db: Db = getDb()): void {
  touchAccount(accountId, { pinHash }, db);
}

/** Light/dark and glass follow the person (D3). */
export function setAccountAppearance(
  accountId: string,
  a: Pick<Account, 'theme' | 'glass'>,
  db: Db = getDb(),
): void {
  touchAccount(accountId, a, db);
}

/** Where they were last, for the next device (D6). Ignores a member that isn't theirs. */
export function rememberLastMember(accountId: string, memberId: string, db: Db = getDb()): void {
  if (!membershipsFor(accountId, db).some((m) => m.id === memberId)) return;
  touchAccount(accountId, { lastMemberId: memberId }, db);
}

/**
 * Owners of real (non-demo) households created before accounts existed. The
 * developer links one of these to their account once, confirming with its old PIN.
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
