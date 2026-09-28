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
  const { adoptLegacyDemoFlag } = await import('./lib/demo');
  adoptLegacyDemoFlag();
  const { purgeEmailEnvelopes, purgeOrphanedBillDocuments } = await import('./ingest/archive');
  const purged = purgeEmailEnvelopes();
  if (purged)
    console.log(`[ingest] removed ${purged} stored forward email(s); their PDFs are kept`);
  const orphans = purgeOrphanedBillDocuments();
  if (orphans) console.log(`[ingest] removed ${orphans} document(s) left behind by deleted bills`);
  // The Unusual rule changed (seasons): re-check every bill once per rule version.
  const { refreshAllAnomalies, ANOMALY_RULE_VERSION } = await import('./lib/bills');
  const fs = await import('node:fs');
  const path = await import('node:path');
  const { ensureDataDirs } = await import('./lib/paths');
  const marker = path.join(ensureDataDirs().config, 'anomaly-rule.json');
  let seen = 0;
  try {
    seen = (JSON.parse(fs.readFileSync(marker, 'utf8')) as { version?: number }).version ?? 0;
  } catch {
    // First run with versioned rules.
  }
  if (seen < ANOMALY_RULE_VERSION) {
    const changed = refreshAllAnomalies();
    fs.writeFileSync(marker, JSON.stringify({ version: ANOMALY_RULE_VERSION }));
    console.log(
      `[bills] Unusual flags re-checked with rule v${ANOMALY_RULE_VERSION}: ${changed} changed`,
    );
  }
  if (env.DEMO_MODE) {
    const { seedDemo } = await import('./db/seed');
    const result = await seedDemo();
    if (!('skipped' in result)) console.log('[demo] seeded fictional household:', result.household);
  }
  const { startWorker } = await import('./worker');
  startWorker();
}
