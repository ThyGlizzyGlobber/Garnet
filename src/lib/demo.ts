import fs from 'node:fs';
import { eq } from 'drizzle-orm';
import path from 'node:path';
import { getDb, type Db } from '@/db/client';
import { household } from '@/db/schema';
import { deleteHousehold, getHousehold, listHouseholds } from '@/lib/households';
import { ensureDataDirs } from '@/lib/paths';

/** Before household.is_demo existed, demo data was marked by this file. */
const LEGACY_FLAG = 'demo.json';
const OFF = 'demo-off.json';

/** True when this household is the fictional demo one. */
function isDemoHousehold(householdId: string, db: Db = getDb()): boolean {
  return getHousehold(householdId, db)?.isDemo ?? false;
}

/** True once the owner has exited demo mode; the seeder then stays off even with DEMO_MODE=true. */
export function demoExited(): boolean {
  return fs.existsSync(path.join(ensureDataDirs().config, OFF));
}

/**
 * One-time upgrade (src/worker/startup.ts): installs seeded before
 * multi-household kept a demo.json flag. Such a database held exactly one
 * household, so that one is the demo; with any other number the flag can't be
 * from then and nothing is marked (demo households sign in with just a PIN).
 */
export function adoptLegacyDemoFlag(db: Db = getDb()): void {
  const flag = path.join(ensureDataDirs().config, LEGACY_FLAG);
  if (!fs.existsSync(flag)) return;
  const all = listHouseholds(db);
  if (all.length === 1)
    db.update(household).set({ isDemo: true }).where(eq(household.id, all[0]!.id)).run();
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
