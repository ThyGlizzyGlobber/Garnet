import fs from 'node:fs';
import path from 'node:path';
import { and, eq, ne } from 'drizzle-orm';
import { getDb, type Db } from '@/db/client';
import { account, household, member, type Account } from '@/db/schema';
import { membershipsFor } from '@/lib/accounts';
import { dataPaths } from '@/lib/paths';

/**
 * A person's profile, the same in every household they belong to: their
 * name and their photo (owner, 2026-10-02). One photo file per person: a new
 * one replaces the last, and removing it (or the account) deletes it. The photo is re-made as a
 * 512 px square JPEG with nothing from the original kept (no location or
 * camera details), at DATA_DIR/avatars/<account id>.jpg, and only people
 * who share a household with them can load it.
 */

export const MAX_NAME = 40;
/** Larger uploads are refused before they're opened. */
export const MAX_PHOTO_BYTES = 15 * 1024 * 1024;

const avatarDir = () => path.join(dataPaths().root, 'avatars');
export const avatarFile = (accountId: string) => path.join(avatarDir(), `${accountId}.jpg`);

/** Where the photo is served, versioned so a new one shows at once; null without one. */
export function avatarUrl(a: Pick<Account, 'id' | 'avatarAt'> | null | undefined): string | null {
  return a?.avatarAt ? `/api/avatar/${a.id}?v=${encodeURIComponent(a.avatarAt)}` : null;
}

export type PhotoResult = { ok: true } | { ok: false; reason: 'too-big' | 'unreadable' };

/** Keep a new photo: turned upright, cropped square from the middle, 512 px, metadata gone. */
export async function savePhoto(
  accountId: string,
  bytes: Buffer,
  db: Db = getDb(),
): Promise<PhotoResult> {
  if (bytes.length > MAX_PHOTO_BYTES) return { ok: false, reason: 'too-big' };
  let out: Buffer;
  try {
    const { default: sharp } = await import('sharp');
    out = await sharp(bytes)
      .rotate()
      .resize(512, 512, { fit: 'cover', position: 'attention' })
      .jpeg({ quality: 86, mozjpeg: true })
      .toBuffer();
  } catch {
    // HEIC (sharp's prebuilt binaries can't open it) or not a picture at all.
    return { ok: false, reason: 'unreadable' };
  }
  fs.mkdirSync(avatarDir(), { recursive: true });
  const file = avatarFile(accountId);
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, out);
  fs.renameSync(tmp, file);
  const now = new Date().toISOString();
  db.update(account).set({ avatarAt: now, updatedAt: now }).where(eq(account.id, accountId)).run();
  return { ok: true };
}

/** The photo's file only: one per person, so it goes when they remove it or their account goes. */
export function deletePhotoFile(accountId: string): void {
  fs.rmSync(avatarFile(accountId), { force: true });
}

export function removePhoto(accountId: string, db: Db = getDb()): void {
  deletePhotoFile(accountId);
  const now = new Date().toISOString();
  db.update(account).set({ avatarAt: null, updatedAt: now }).where(eq(account.id, accountId)).run();
}

/** May this viewer see that person's photo? Themselves, or someone they share a household with. */
export function maySeePhoto(viewerAccountId: string, accountId: string, db: Db = getDb()): boolean {
  if (viewerAccountId === accountId) return true;
  const theirs = new Set(membershipsFor(accountId, db).map((m) => m.householdId));
  return membershipsFor(viewerAccountId, db).some((m) => theirs.has(m.householdId));
}

/**
 * Change a person's name everywhere: on the account and in each household
 * they belong to. A household where someone else already goes by that name
 * keeps the old one (names are unique within a household); those are returned.
 */
export function renameEverywhere(
  accountId: string,
  name: string,
  db: Db = getDb(),
): { kept: string[] } {
  const now = new Date().toISOString();
  const kept: string[] = [];
  db.transaction((tx) => {
    tx.update(account).set({ name, updatedAt: now }).where(eq(account.id, accountId)).run();
    for (const m of membershipsFor(accountId, tx as unknown as Db)) {
      if (m.name === name) continue;
      const taken = tx
        .select({ id: member.id })
        .from(member)
        .where(
          and(eq(member.householdId, m.householdId), eq(member.name, name), ne(member.id, m.id)),
        )
        .get();
      if (taken) {
        const hh = tx
          .select({ name: household.name })
          .from(household)
          .where(eq(household.id, m.householdId))
          .get();
        kept.push(hh?.name ?? '');
        continue;
      }
      tx.update(member).set({ name, updatedAt: now }).where(eq(member.id, m.id)).run();
    }
  });
  return { kept };
}
