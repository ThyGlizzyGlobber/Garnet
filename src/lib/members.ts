import { and, asc, count, eq } from 'drizzle-orm';
import { getDb, type Db } from '@/db/client';
import { member, share, type Member } from '@/db/schema';
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
  pinHash: string;
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
    name: input.name.trim(),
    pinHash: input.pinHash,
    role: input.role ?? 'member',
    splitWeight: input.splitWeight ?? 1,
    activeFrom: input.activeFrom,
    activeTo: input.activeTo ?? null,
    colour: input.colour ?? '#0a84ff',
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
  patch: Partial<Omit<MemberInput, 'pinHash'>> & { pinHash?: string },
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

/** Members with shares can't be deleted; deactivate with activeTo instead. */
export function deleteMember(householdId: string, id: string, db: Db = getDb()): void {
  const m = getMember(householdId, id, db);
  if (!m) return;
  if (m.role === 'owner') throw new Error('The owner cannot be deleted');
  const n = db.select({ n: count() }).from(share).where(eq(share.memberId, id)).get()?.n ?? 0;
  if (n > 0)
    throw new Error('This member has bill shares. Set a move-out date instead of deleting.');
  db.delete(member)
    .where(and(eq(member.householdId, householdId), eq(member.id, id)))
    .run();
}
