import fs from 'node:fs';
import path from 'node:path';
import { getDb, type Db } from '@/db/client';
import { household } from '@/db/schema';
import { deleteHousehold, getHousehold } from '@/lib/households';
import { ensureDataDirs } from '@/lib/paths';

/** Before household.is_demo existed, demo data was marked by this file. */
const LEGACY_FLAG = 'demo.json';
const OFF = 'demo-off.json';

/** True when this household is the fictional demo one. */
export function isDemoHousehold(householdId: string, db: Db = getDb()): boolean {
  return getHousehold(householdId, db)?.isDemo ?? false;
}

/** True once the owner has exited demo mode; the seeder then stays off even with DEMO_MODE=true. */
export function demoExited(): boolean {
  return fs.existsSync(path.join(ensureDataDirs().config, OFF));
}

/**
 * One-time upgrade: installs seeded before multi-household kept a demo.json flag.
 * At that point the database held exactly one household, so that one is the demo.
 */
export function adoptLegacyDemoFlag(db: Db = getDb()): void {
  const flag = path.join(ensureDataDirs().config, LEGACY_FLAG);
  if (!fs.existsSync(flag)) return;
  db.update(household).set({ isDemo: true }).run();
  fs.rmSync(flag, { force: true });
}

/** Delete the demo household and everything it owns, and remember that demo mode was left. */
export function exitDemo(householdId: string, db: Db = getDb()): void {
  if (!isDemoHousehold(householdId, db)) throw new Error('This is not the demo household');
  deleteHousehold(householdId, db);
  fs.writeFileSync(
    path.join(ensureDataDirs().config, OFF),
    JSON.stringify({ exitedAt: new Date().toISOString() }),
  );
}
