import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { ensureDataDirs } from '@/lib/paths';
import * as schema from './schema';

export type Db = BetterSQLite3Database<typeof schema>;

let instance: { sqlite: Database.Database; db: Db } | undefined;

/** Open (once) the SQLite database under DATA_DIR/db and return the Drizzle client. */
export function getDb(): Db {
  if (!instance) instance = openDb();
  return instance.db;
}

export function openDb(dataDir?: string) {
  const paths = ensureDataDirs(dataDir);
  const sqlite = new Database(paths.dbFile);
  // WAL gives concurrent readers (dashboard) alongside the ingestion writer.
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');
  sqlite.pragma('busy_timeout = 5000');
  const db = drizzle(sqlite, { schema });
  return { sqlite, db };
}

/** Close the shared connection (used by tests and graceful shutdown). */
export function closeDb() {
  instance?.sqlite.close();
  instance = undefined;
}
