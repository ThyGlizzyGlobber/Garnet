import { asc, count, eq } from 'drizzle-orm';
import { getDb, type Db } from '@/db/client';
import { member, share, type Member } from '@/db/schema';
import { ulid } from '@/lib/ids';

export function listMembers(db: Db = getDb()): Member[] {
  return db.select().from(member).orderBy(asc(member.activeFrom), asc(member.name)).all();
}

export function listActiveMembers(today: string, db: Db = getDb()): Member[] {
  return listMembers(db).filter(
    (m) => m.activeFrom <= today && (m.activeTo === null || m.activeTo >= today),
  );
}

export function getMember(id: string, db: Db = getDb()): Member | null {
  return db.select().from(member).where(eq(member.id, id)).get() ?? null;
}

export function getMemberByName(name: string, db: Db = getDb()): Member | null {
  const wanted = name.trim().toLowerCase();
  return listMembers(db).find((m) => m.name.toLowerCase() === wanted) ?? null;
}

export function countMembers(db: Db = getDb()): number {
  return db.select({ n: count() }).from(member).get()?.n ?? 0;
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

export function createMember(input: MemberInput, db: Db = getDb()): Member {
  if (getMemberByName(input.name, db)) throw new Error('A member with that name already exists');
  const now = new Date().toISOString();
  const row = {
    id: ulid(),
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
  id: string,
  patch: Partial<Omit<MemberInput, 'pinHash'>> & { pinHash?: string },
  db: Db = getDb(),
): Member {
  const existing = getMember(id, db);
  if (!existing) throw new Error('Member not found');
  if (patch.name) {
    const clash = getMemberByName(patch.name, db);
    if (clash && clash.id !== id) throw new Error('A member with that name already exists');
  }
  db.update(member)
    .set({
      ...patch,
      ...(patch.name ? { name: patch.name.trim() } : {}),
      updatedAt: new Date().toISOString(),
    })
    .where(eq(member.id, id))
    .run();
  return getMember(id, db)!;
}

/** Members with shares can't be deleted; deactivate with activeTo instead. */
export function deleteMember(id: string, db: Db = getDb()): void {
  const m = getMember(id, db);
  if (!m) return;
  if (m.role === 'owner') throw new Error('The owner cannot be deleted');
  const n = db.select({ n: count() }).from(share).where(eq(share.memberId, id)).get()?.n ?? 0;
  if (n > 0)
    throw new Error('This member has bill shares. Set a move-out date instead of deleting.');
  db.delete(member).where(eq(member.id, id)).run();
}
