import { and, desc, eq, isNull } from 'drizzle-orm';
import { getDb, type Db } from '@/db/client';
import {
  accessRequest,
  account,
  allowedSignup,
  installSetting,
  member,
  type AccessRequest,
  type AllowedSignup,
} from '@/db/schema';
import { normaliseEmail } from '@/lib/auth/tokens';
import { operatorEmails } from '@/lib/env';
import { ulid } from '@/lib/ids';

/**
 * Early access (SCOPE-console.md §4): while the switch is on, an email may
 * create an account only when it is on the list, has been invited into a
 * household, or belongs to a developer. Both sign-in paths ask `maySignUp()`
 * before an account exists; existing accounts are never affected. Strangers
 * can ask to be let in; the console decides.
 */
const EARLY_ACCESS = 'early_access';

function getSetting(key: string, db: Db = getDb()): string | null {
  return db.select().from(installSetting).where(eq(installSetting.key, key)).get()?.value ?? null;
}

function setSetting(key: string, value: string, db: Db = getDb()): void {
  const updatedAt = new Date().toISOString();
  db.insert(installSetting)
    .values({ key, value, updatedAt })
    .onConflictDoUpdate({ target: installSetting.key, set: { value, updatedAt } })
    .run();
}

/** On from the first build (C-D2): only an explicit "off" opens sign-up. */
export function earlyAccessOn(db: Db = getDb()): boolean {
  return getSetting(EARLY_ACCESS, db) !== 'off';
}

export function setEarlyAccess(on: boolean, db: Db = getDb()): void {
  setSetting(EARLY_ACCESS, on ? 'on' : 'off', db);
}

export function listAllowed(db: Db = getDb()): AllowedSignup[] {
  return db.select().from(allowedSignup).orderBy(desc(allowedSignup.addedAt)).all();
}

export function isAllowed(email: string, db: Db = getDb()): boolean {
  return !!db
    .select({ email: allowedSignup.email })
    .from(allowedSignup)
    .where(eq(allowedSignup.email, normaliseEmail(email)))
    .get();
}

/** Add addresses to the list (one per line or comma); returns how many were new. */
export function allowEmails(
  emails: string[],
  by: { accountId: string | null; note?: string | null },
  db: Db = getDb(),
): number {
  const now = new Date().toISOString();
  let added = 0;
  for (const raw of emails) {
    const email = normaliseEmail(raw);
    if (!email.includes('@') || isAllowed(email, db)) continue;
    db.insert(allowedSignup)
      .values({ email, note: by.note ?? null, addedByAccountId: by.accountId, addedAt: now })
      .run();
    added++;
  }
  return added;
}

/** Removing an address only stops a future sign-up; an existing account stays. */
export function disallowEmail(email: string, db: Db = getDb()): void {
  db.delete(allowedSignup)
    .where(eq(allowedSignup.email, normaliseEmail(email)))
    .run();
}

/** An invited member who hasn't joined yet, by the address their invite went to. */
function isInvited(email: string, db: Db): boolean {
  return !!db
    .select({ id: member.id })
    .from(member)
    .where(and(eq(member.email, email), isNull(member.accountId)))
    .get();
}

function hasAccount(email: string, db: Db): boolean {
  return !!db.select({ id: account.id }).from(account).where(eq(account.email, email)).get();
}

/**
 * Whether this address may sign in: always for an existing account, a
 * developer or an invited person; otherwise only when early access is off
 * or the address is on the list.
 */
export function maySignUp(rawEmail: string, db: Db = getDb()): boolean {
  const email = normaliseEmail(rawEmail);
  if (hasAccount(email, db) || operatorEmails().includes(email) || isInvited(email, db))
    return true;
  if (!earlyAccessOn(db)) return true;
  return isAllowed(email, db);
}

/** Called when an account is created, so the list shows who has signed up. */
export function markAllowedUsed(email: string, db: Db = getDb()): void {
  db.update(allowedSignup)
    .set({ usedAt: new Date().toISOString() })
    .where(and(eq(allowedSignup.email, normaliseEmail(email)), isNull(allowedSignup.usedAt)))
    .run();
}

/** A stranger's request from the sign-in page; one open request per address. */
export function requestAccess(
  input: { name: string; email: string; message: string | null },
  db: Db = getDb(),
): AccessRequest {
  const email = normaliseEmail(input.email);
  const open = db
    .select()
    .from(accessRequest)
    .where(and(eq(accessRequest.email, email), isNull(accessRequest.decidedAt)))
    .get();
  if (open) return open;
  const row: AccessRequest = {
    id: ulid(),
    name: input.name.trim(),
    email,
    message: input.message?.trim() || null,
    createdAt: new Date().toISOString(),
    decidedAt: null,
    decidedByAccountId: null,
    outcome: null,
  };
  db.insert(accessRequest).values(row).run();
  return row;
}

export function listRequests(db: Db = getDb()): AccessRequest[] {
  return db.select().from(accessRequest).orderBy(desc(accessRequest.createdAt)).all();
}

/** Approve (and list the address) or decline a request. Returns the request, or null when unknown. */
export function decideRequest(
  id: string,
  outcome: 'approved' | 'declined',
  byAccountId: string | null,
  db: Db = getDb(),
): AccessRequest | null {
  const r = db.select().from(accessRequest).where(eq(accessRequest.id, id)).get();
  if (!r || r.decidedAt) return r ?? null;
  const now = new Date().toISOString();
  db.update(accessRequest)
    .set({ decidedAt: now, decidedByAccountId: byAccountId, outcome })
    .where(eq(accessRequest.id, id))
    .run();
  if (outcome === 'approved') allowEmails([r.email], { accountId: byAccountId, note: r.name }, db);
  return { ...r, decidedAt: now, decidedByAccountId: byAccountId, outcome };
}

/**
 * The first build with early access on (C-D2): everyone who already has an
 * account, and every developer, goes on the list so nothing changes for them.
 */
export function seedAllowedFromAccounts(db: Db = getDb()): number {
  const emails = [
    ...db
      .select({ email: account.email })
      .from(account)
      .all()
      .map((a) => a.email),
    ...operatorEmails(),
  ];
  return allowEmails(emails, { accountId: null, note: 'already here' }, db);
}
