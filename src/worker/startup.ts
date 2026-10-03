import fs from 'node:fs';
import path from 'node:path';
import { runMigrations } from '@/db/migrate';
import { purgeEmailEnvelopes, purgeOrphanedBillDocuments } from '@/ingest/archive';
import { adoptSetUpBy } from '@/ingest/set-up-by';
import { ANOMALY_RULE_VERSION, refreshAllAnomalies } from '@/lib/bills';
import { seedAllowedFromAccounts } from '@/lib/access';
import { sealExistingFiles } from '@/ingest/seal';
import { anyHouseholdKeyed, dataKeyConfigured } from '@/lib/crypto';
import { uncapDeveloperHouseholds } from '@/lib/console';
import { adoptLegacyDemoFlag } from '@/lib/demo';
import { getEnv } from '@/lib/env';
import { ensureDataDirs } from '@/lib/paths';
import { markWaterFiguresForReread } from '@/lib/metrics';
import { runOnce } from '@/lib/upgrades';

/**
 * Everything the data needs before the server takes requests: migrations, then
 * each one-off upgrade step once per install (src/lib/upgrades.ts), then the
 * fictional demo household when DEMO_MODE is on. Called from instrumentation.
 */
export async function prepareInstall(): Promise<void> {
  const env = getEnv();
  runMigrations(env.DATA_DIR);
  // Bill files encrypted at rest (SCOPE-console.md §5b): once any household has a
  // key, the master key must be there to open them; with it, older files get sealed.
  if (anyHouseholdKeyed() && !dataKeyConfigured())
    throw new Error(
      'DATA_KEY is not set, but households have encrypted files. Set it before starting.',
    );

  const log = (tag: string, n: number | null, what: string) => {
    if (n) console.log(`[${tag}] ${what.replace('{n}', String(n))}`);
  };
  // Installs seeded before multi-household marked demo data with a file.
  runOnce('2026-09-26 legacy demo flag', () => adoptLegacyDemoFlag());
  // Forwarded emails used to be kept beside their PDFs as "envelopes".
  log(
    'ingest',
    runOnce('2026-09-28 purge email envelopes', () => purgeEmailEnvelopes()),
    'removed {n} stored forward email(s); their PDFs are kept',
  );
  // Bills deleted before deleting a bill removed its file too.
  log(
    'ingest',
    runOnce('2026-09-28 purge orphaned bill documents', () => purgeOrphanedBillDocuments()),
    'removed {n} document(s) left behind by deleted bills',
  );
  // The Unusual rule changed (seasons): re-check every bill once per rule version.
  log(
    'bills',
    runOnce(`anomaly rule v${ANOMALY_RULE_VERSION}`, () => refreshAllAnomalies()),
    `Unusual flags re-checked with rule v${ANOMALY_RULE_VERSION}: {n} changed`,
  );
  fs.rmSync(path.join(ensureDataDirs().config, 'anomaly-rule.json'), { force: true });
  // "Who's this for?" goes to whoever brought the bill in, not the admins.
  log(
    'services',
    runOnce('2026-09-29 adopt set-up-by', () => adoptSetUpBy()),
    'found who set up {n} service(s)',
  );
  // The IMAP poller was removed: its progress file has nothing left to track.
  runOnce('2026-09-29 remove mailbox poller state', () =>
    fs.rmSync(path.join(ensureDataDirs().config, 'imap-state.json'), { force: true }),
  );

  if (env.OPERATOR_EMAILS && !env.DEVELOPER_EMAILS)
    console.warn(
      '[env] OPERATOR_EMAILS is now DEVELOPER_EMAILS; the old name still works for this release.',
    );
  // The developers' own households used to be uncapped by rule; now it's an explicit entry (C-D4).
  log(
    'usage',
    runOnce('2026-10-01 developers households no cap', () => uncapDeveloperHouseholds()),
    'gave {n} household(s) of developers no AI cap',
  );
  // Early access is on from the first build with it: everyone already here is on the list.
  log(
    'access',
    runOnce('2026-10-01 early access list from accounts', () => seedAllowedFromAccounts()),
    'listed {n} address(es) that already had an account',
  );
  // Water usage is per meter-reading period: figures from before may lack those dates.
  log(
    'usage',
    runOnce('2026-10-03 water figures again', () => markWaterFiguresForReread()),
    'marked {n} water bill(s) to have their figures analysed again',
  );

  if (dataKeyConfigured()) {
    const n = sealExistingFiles();
    if (n) console.log(`[files] sealed ${n} file(s) at rest`);
  }

  if (env.DEMO_MODE) {
    const { seedDemo } = await import('@/db/demo-seed');
    const result = await seedDemo();
    if (!('skipped' in result)) console.log('[demo] seeded fictional household:', result.household);
  }
}
