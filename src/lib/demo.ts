import fs from 'node:fs';
import path from 'node:path';
import { getDb, type Db } from '@/db/client';
import {
  bill,
  household,
  member,
  projection,
  service,
  serviceSplit,
  share,
  sourceDocument,
} from '@/db/schema';
import { ensureDataDirs } from '@/lib/paths';

const FLAG = 'demo.json';
const OFF = 'demo-off.json';

/** True when the current data was created by the demo seeder. */
export function isDemoData(): boolean {
  return fs.existsSync(path.join(ensureDataDirs().config, FLAG));
}

/** True once the owner has exited demo mode; the seeder then stays off even with DEMO_MODE=true. */
export function demoExited(): boolean {
  return fs.existsSync(path.join(ensureDataDirs().config, OFF));
}

export function markDemoSeeded(): void {
  fs.writeFileSync(
    path.join(ensureDataDirs().config, FLAG),
    JSON.stringify({ seededAt: new Date().toISOString() }),
  );
}

/** Wipe every household record (the service-type catalog stays) and remember that demo mode was left. */
export function exitDemo(db: Db = getDb()): void {
  db.transaction((tx) => {
    tx.delete(share).run();
    tx.delete(bill).run();
    tx.delete(projection).run();
    tx.delete(sourceDocument).run();
    tx.delete(serviceSplit).run();
    tx.delete(service).run();
    tx.delete(member).run();
    tx.delete(household).run();
  });
  const { config } = ensureDataDirs();
  fs.rmSync(path.join(config, FLAG), { force: true });
  fs.writeFileSync(path.join(config, OFF), JSON.stringify({ exitedAt: new Date().toISOString() }));
}
