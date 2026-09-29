import { and, asc, count, eq } from 'drizzle-orm';
import { getDb, type Db } from '@/db/client';
import { member, service, share, sourceDocument, type Member } from '@/db/schema';
import { ulid } from '@/lib/ids';

export function listMembers(householdId: string, db: Db = getDb()): Member[] {
  return db
    .select()
    .from(member)
    .where(eq(member.householdId, householdId))
    .orderBy(asc(member.activeFrom), asc(member.name))
    .all();
}

export function listActiveMembers(householdId: string, today: string, db: Db = getDb()): Member[] {
  return listMembers(householdId, db).filter(
    (m) => m.activeFrom <= today && (m.activeTo === null || m.activeTo >= today),
  );
}

export function getMember(householdId: string, id: string, db: Db = getDb()): Member | null {
  return (
    db
      .select()
      .from(member)
      .where(and(eq(member.householdId, householdId), eq(member.id, id)))
      .get() ?? null
  );
}

/**
 * Unscoped lookup for the session layer only: the session cookie holds a member
 * id, and the member row is what tells us which household the request is for.
 */
export function getMemberForSession(id: string, db: Db = getDb()): Member | null {
  return db.select().from(member).where(eq(member.id, id)).get() ?? null;
}

export function getMemberByName(
  householdId: string,
  name: string,
  db: Db = getDb(),
): Member | null {
  const wanted = name.trim().toLowerCase();
  return listMembers(householdId, db).find((m) => m.name.toLowerCase() === wanted) ?? null;
}

export function countMembers(householdId: string, db: Db = getDb()): number {
  return (
    db.select({ n: count() }).from(member).where(eq(member.householdId, householdId)).get()?.n ?? 0
  );
}

export interface MemberInput {
  name: string;
  pinHash?: string | null;
  accountId?: string | null;
  email?: string | null;
  role?: 'owner' | 'member';
  splitWeight?: number;
  activeFrom: string;
  activeTo?: string | null;
  colour?: string;
  paymentDetails?: { label: string; value: string }[];
}

export function createMember(householdId: string, input: MemberInput, db: Db = getDb()): Member {
  if (getMemberByName(householdId, input.name, db))
    throw new Error('A member with that name already exists');
  const now = new Date().toISOString();
  const row = {
    id: ulid(),
    householdId,
    accountId: input.accountId ?? null,
    email: input.email?.trim().toLowerCase() || null,
    name: input.name.trim(),
    pinHash: input.pinHash ?? null,
    role: input.role ?? 'member',
    splitWeight: input.splitWeight ?? 1,
    activeFrom: input.activeFrom,
    activeTo: input.activeTo ?? null,
    colour: input.colour ?? '#0a84ff',
    notifyBills: true,
    notifyReminders: true,
    notifyProblems: true,
    paymentDetails: input.paymentDetails ?? [],
    createdAt: now,
    updatedAt: now,
  };
  db.insert(member).values(row).run();
  return row;
}

export function updateMember(
  householdId: string,
  id: string,
  patch: Partial<MemberInput>,
  db: Db = getDb(),
): Member {
  const existing = getMember(householdId, id, db);
  if (!existing) throw new Error('Member not found');
  if (patch.name) {
    const clash = getMemberByName(householdId, patch.name, db);
    if (clash && clash.id !== id) throw new Error('A member with that name already exists');
  }
  db.update(member)
    .set({
      ...patch,
      ...(patch.name ? { name: patch.name.trim() } : {}),
      updatedAt: new Date().toISOString(),
    })
    .where(and(eq(member.householdId, householdId), eq(member.id, id)))
    .run();
  return getMember(householdId, id, db)!;
}

/**
 * Make a member an admin (role "owner": adds members, sends invites, changes
 * household settings) or a member again. A household always keeps at least
 * one admin.
 */
export function setMemberRole(
  householdId: string,
  id: string,
  role: 'owner' | 'member',
  db: Db = getDb(),
): Member {
  const m = getMember(householdId, id, db);
  if (!m) throw new Error('Member not found');
  if (m.role === role) return m;
  if (role === 'member') {
    const admins = listMembers(householdId, db).filter((x) => x.role === 'owner');
    if (admins.length <= 1) throw new Error('A household needs at least one admin');
  }
  db.update(member)
    .set({ role, updatedAt: new Date().toISOString() })
    .where(and(eq(member.householdId, householdId), eq(member.id, id)))
    .run();
  return getMember(householdId, id, db)!;
}

/** Members with shares can't be deleted; deactivate with activeTo instead. */
export function deleteMember(householdId: string, id: string, db: Db = getDb()): void {
  const m = getMember(householdId, id, db);
  if (!m) return;
  if (m.role === 'owner')
    throw new Error('An admin can’t be deleted. Remove their admin role first.');
  const n = db.select({ n: count() }).from(share).where(eq(share.memberId, id)).get()?.n ?? 0;
  if (n > 0)
    throw new Error('This member has bill shares. Set a move-out date instead of deleting.');
  // Their personal services would otherwise have nobody to belong to (or show to everyone).
  const own = db.select({ n: count() }).from(service).where(eq(service.ownerMemberId, id)).get();
  if ((own?.n ?? 0) > 0)
    throw new Error('This member has personal services. Set a move-out date instead of deleting.');
  // Documents they uploaded stay, without their name.
  db.update(sourceDocument).set({ memberId: null }).where(eq(sourceDocument.memberId, id)).run();
  db.delete(member)
    .where(and(eq(member.householdId, householdId), eq(member.id, id)))
    .run();
}
