import { and, desc, eq, isNull } from 'drizzle-orm';
import { getDb, type Db } from '@/db/client';
import { household, invite, member, type Household, type Invite, type Member } from '@/db/schema';
import { linkMember, membershipsFor } from '@/lib/accounts';
import { normaliseTypedCode, randomToken, randomTypedCode, sha256 } from '@/lib/auth/tokens';
import { ulid } from '@/lib/ids';
import { getMember } from '@/lib/members';

export const INVITE_TTL_MS = 7 * 86_400_000;

export interface IssuedInvite {
  invite: Invite;
  /** Only returned at creation; the database keeps hashes. */
  token: string;
  code: string;
}

/**
 * Invite someone to take over a member row. Any earlier open invite for the
 * same member is revoked, so only the newest link and code work.
 */
export function createInvite(
  householdId: string,
  memberId: string,
  opts: { email?: string | null; createdByMemberId?: string | null },
  db: Db = getDb(),
  now = Date.now(),
): IssuedInvite {
  const m = getMember(householdId, memberId, db);
  if (!m) throw new Error('Member not found');
  if (m.accountId) throw new Error('This member has already joined');
  const iso = new Date(now).toISOString();
  db.update(invite)
    .set({ revokedAt: iso })
    .where(and(eq(invite.memberId, memberId), isNull(invite.acceptedAt), isNull(invite.revokedAt)))
    .run();
  const token = randomToken();
  const code = randomTypedCode();
  const row: Invite = {
    id: ulid(),
    householdId,
    memberId,
    email: opts.email?.trim().toLowerCase() || null,
    tokenHash: sha256(token),
    codeHash: sha256(code),
    createdByMemberId: opts.createdByMemberId ?? null,
    expiresAt: new Date(now + INVITE_TTL_MS).toISOString(),
    acceptedAt: null,
    acceptedByAccountId: null,
    revokedAt: null,
    createdAt: iso,
  };
  db.insert(invite).values(row).run();
  if (row.email && !m.email)
    db.update(member).set({ email: row.email }).where(eq(member.id, memberId)).run();
  return { invite: row, token, code };
}

export interface OpenInvite {
  invite: Invite;
  household: Household;
  member: Member;
  invitedBy: Member | null;
}

function open(row: Invite | undefined, db: Db, now: number): OpenInvite | null {
  if (!row || row.acceptedAt || row.revokedAt || Date.parse(row.expiresAt) <= now) return null;
  const hh = db.select().from(household).where(eq(household.id, row.householdId)).get();
  const m = getMember(row.householdId, row.memberId, db);
  if (!hh || !m || m.accountId) return null;
  const by = row.createdByMemberId ? getMember(row.householdId, row.createdByMemberId, db) : null;
  return { invite: row, household: hh, member: m, invitedBy: by };
}

export function findInviteByToken(token: string, db: Db = getDb(), now = Date.now()) {
  if (!token) return null;
  return open(
    db
      .select()
      .from(invite)
      .where(eq(invite.tokenHash, sha256(token)))
      .get(),
    db,
    now,
  );
}

export function findInviteByCode(typed: string, db: Db = getDb(), now = Date.now()) {
  const code = normaliseTypedCode(typed);
  if (!/^[0-9A-Z]{4}-[0-9A-Z]{4}$/.test(code)) return null;
  return open(
    db
      .select()
      .from(invite)
      .where(eq(invite.codeHash, sha256(code)))
      .get(),
    db,
    now,
  );
}

/** Link the account to the invited member. The alpha keeps one household per account. */
export function acceptInvite(
  inviteId: string,
  accountId: string,
  accountEmail: string,
  db: Db = getDb(),
  now = Date.now(),
): Member {
  return db.transaction((tx) => {
    const found = open(tx.select().from(invite).where(eq(invite.id, inviteId)).get(), tx, now);
    if (!found) throw new Error('This invitation has expired or was already used');
    if (membershipsFor(accountId, tx).length)
      throw new Error(
        'You already belong to a household. Joining a second one is not supported yet.',
      );
    linkMember(found.member.id, accountId, found.member.email ?? accountEmail, tx);
    tx.update(invite)
      .set({ acceptedAt: new Date(now).toISOString(), acceptedByAccountId: accountId })
      .where(eq(invite.id, inviteId))
      .run();
    return getMember(found.household.id, found.member.id, tx)!;
  });
}

/** Latest invite per member in a household, for the Members page. */
export function latestInvites(householdId: string, db: Db = getDb()): Map<string, Invite> {
  const rows = db
    .select()
    .from(invite)
    .where(eq(invite.householdId, householdId))
    .orderBy(desc(invite.createdAt))
    .all();
  const out = new Map<string, Invite>();
  for (const r of rows) if (!out.has(r.memberId)) out.set(r.memberId, r);
  return out;
}

export function revokeInvites(householdId: string, memberId: string, db: Db = getDb()): void {
  db.update(invite)
    .set({ revokedAt: new Date().toISOString() })
    .where(
      and(
        eq(invite.householdId, householdId),
        eq(invite.memberId, memberId),
        isNull(invite.acceptedAt),
        isNull(invite.revokedAt),
      ),
    )
    .run();
}

/**
 * Where a member stands with signing in: joined (linked to an account), or
 * their latest invitation is pending, has expired, or there is none.
 */
export function joinStatus(
  m: { accountId: string | null },
  latest: Invite | undefined,
  now = Date.now(),
): 'joined' | 'pending' | 'expired' | 'none' {
  if (m.accountId) return 'joined';
  const s = inviteState(latest, now);
  return s === 'pending' || s === 'expired' ? s : 'none';
}

export function inviteState(i: Invite | undefined, now = Date.now()) {
  if (!i) return 'none' as const;
  if (i.acceptedAt) return 'accepted' as const;
  if (i.revokedAt) return 'revoked' as const;
  if (Date.parse(i.expiresAt) <= now) return 'expired' as const;
  return 'pending' as const;
}
