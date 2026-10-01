import fs from 'node:fs';
import path from 'node:path';
import { getDb, type Db } from '@/db/client';
import { sourceDocument } from '@/db/schema';
import { isEncrypted, sealFor } from '@/lib/crypto';
import { dataPaths } from '@/lib/paths';
import { documentPath, originalPath } from './archive';

/**
 * Files written before the install had a master key are sealed on the next
 * start that has one (SCOPE-console.md §5b, C4): each document's file, its
 * original scan and its preview, one at a time, written beside and renamed
 * into place. Cheap afterwards: four bytes read per file. The updater's ZFS
 * snapshot is the way back.
 */
export function sealExistingFiles(db: Db = getDb()): number {
  let sealed = 0;
  const seal = (householdId: string, abs: string) => {
    let stored: Buffer;
    try {
      stored = fs.readFileSync(abs);
    } catch {
      return;
    }
    if (isEncrypted(stored)) return;
    const tmp = `${abs}.${process.pid}.sealing`;
    fs.writeFileSync(tmp, sealFor(householdId, stored, db));
    fs.renameSync(tmp, abs);
    sealed++;
  };
  for (const doc of db.select().from(sourceDocument).all()) {
    seal(doc.householdId, documentPath(doc));
    seal(doc.householdId, originalPath(doc));
    seal(doc.householdId, path.join(dataPaths().root, 'previews', `${doc.id}.png`));
  }
  return sealed;
}
