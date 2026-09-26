import fs from 'node:fs';
import path from 'node:path';
import type Database from 'better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { dataPaths } from '@/lib/paths';
import { openDb } from './client';

/** Journal entries not yet recorded in __drizzle_migrations (0 on a fresh database). */
function pendingCount(sqlite: Database.Database, migrationsFolder: string): number {
  const journal = JSON.parse(
    fs.readFileSync(path.join(migrationsFolder, 'meta', '_journal.json'), 'utf8'),
  ) as { entries: unknown[] };
  const hasTable = sqlite
    .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = '__drizzle_migrations'")
    .get();
  if (!hasTable) return 0;
  const applied = (
    sqlite.prepare('SELECT count(*) AS n FROM __drizzle_migrations').get() as {
      n: number;
    }
  ).n;
  return Math.max(0, journal.entries.length - applied);
}

/**
 * Apply pending Drizzle migrations from ./drizzle. Runs on app start
 * (src/instrumentation.ts) and via `npm run db:migrate`.
 *
 * Before touching an existing database it writes a consistent copy next to it
 * (db/utilities.pre-migrate-<time>.sqlite). Foreign keys are off while
 * migrations run so SQLite table rebuilds (drop + rename) never fire cascades;
 * SQLite ignores that pragma inside a transaction, so it is set before the
 * migrator's BEGIN. Afterwards foreign_key_check must come back clean or the
 * app refuses to start, pointing at the backup.
 */
export function runMigrations(
  dataDir?: string,
  migrationsFolder = path.join(process.cwd(), 'drizzle'),
) {
  const { sqlite, db } = openDb(dataDir);
  try {
    let backup: string | null = null;
    if (pendingCount(sqlite, migrationsFolder) > 0) {
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      backup = path.join(dataPaths(dataDir).dbDir, `utilities.pre-migrate-${stamp}.sqlite`);
      sqlite.prepare('VACUUM INTO ?').run(backup);
    }
    sqlite.pragma('foreign_keys = OFF');
    migrate(db, { migrationsFolder });
    const problems = sqlite.pragma('foreign_key_check') as unknown[];
    if (problems.length)
      throw new Error(
        `Migrations left ${problems.length} foreign-key violation(s).` +
          (backup ? ` The database before migrating is at ${backup}.` : ''),
      );
  } finally {
    sqlite.close();
  }
}

// Allow `tsx src/db/migrate.ts` as a CLI.
const invokedDirectly =
  typeof process !== 'undefined' &&
  process.argv[1] !== undefined &&
  /migrate\.(ts|js)$/.test(process.argv[1]);
if (invokedDirectly) {
  runMigrations();
  console.log('Migrations applied.');
}
