import path from 'node:path';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { openDb } from './client';

/**
 * Apply pending Drizzle migrations from ./drizzle. Runs on app start
 * (src/instrumentation.ts) and via `npm run db:migrate`.
 */
export function runMigrations(dataDir?: string) {
  const { sqlite, db } = openDb(dataDir);
  const migrationsFolder = path.join(process.cwd(), 'drizzle');
  migrate(db, { migrationsFolder });
  sqlite.close();
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
