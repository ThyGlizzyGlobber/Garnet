/**
 * Runs once when the Next.js server starts (both `next dev` and the standalone
 * server in Docker). Applies migrations so a fresh volume is ready on first boot,
 * and seeds the fictional demo household when DEMO_MODE is on.
 * Phase 3 starts the IMAP poller from here as well.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  const { getEnv } = await import('./lib/env');
  const env = getEnv();
  const { runMigrations } = await import('./db/migrate');
  runMigrations(env.DATA_DIR);
  if (env.DEMO_MODE) {
    const { seedDemo } = await import('./db/seed');
    const result = await seedDemo();
    if (!('skipped' in result)) console.log('[demo] seeded fictional household:', result.household);
  }
}
