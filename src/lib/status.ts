import { and, count, eq, isNotNull } from 'drizzle-orm';
import { getDb, type Db } from '@/db/client';
import { bill } from '@/db/schema';
import { allExtractors } from '@/ingest/extractors';
import { readImapState } from '@/ingest/imap/poller';
import { getEnv, isImapConfigured, isLlmConfigured } from '@/lib/env';
import { regionalCounts, regionalEnabled } from '@/lib/regional';
import { documentCounts, ingestionStats } from '@/lib/review';
import { aiAllowance } from '@/lib/usage';
import { weatherStatus } from '@/lib/weather';
import { workerStatus } from '@/worker';

/**
 * Everything the status page shows. The household's own reading figures are
 * for every member; `install` (mailbox, weather service, area figures, the
 * reader's model) describes the whole install, so only operators get it.
 */
export function statusView(householdId: string, operator: boolean, db: Db = getDb()) {
  const env = getEnv();
  const counts = documentCounts(householdId, db);
  const ing = ingestionStats(householdId, db);
  const decided = ing.auto + ing.reviewed + counts.needs_review;
  const household = {
    /** Share of decided documents read without typing (0–1), or null before any. */
    autoRate: decided > 0 ? ing.auto / decided : null,
    waiting: counts.needs_review,
    extracted: counts.extracted,
    ignored: counts.ignored,
    archived: counts.extracted + counts.needs_review + counts.ignored + counts.unprocessed,
    ai: aiAllowance(householdId, db),
    threshold: env.EXTRACTOR_CONFIDENCE_THRESHOLD,
    billsWithWeather: db
      .select({ n: count() })
      .from(bill)
      .where(and(eq(bill.householdId, householdId), isNotNull(bill.weatherFilledAt)))
      .get()!.n,
  };
  if (!operator) return { household, install: null };

  const worker = workerStatus();
  const imapOn = isImapConfigured(env);
  const install = {
    mailbox: {
      configured: imapOn,
      account: imapOn
        ? `${env.IMAP_USER} @ ${env.IMAP_HOST}:${env.IMAP_PORT} · ${env.IMAP_MAILBOX}`
        : null,
      state: !imapOn
        ? ('off' as const)
        : worker.lastPoll?.error
          ? ('error' as const)
          : worker.enabled
            ? ('on' as const)
            : ('paused' as const),
      intervalSeconds: worker.intervalSeconds,
      lastPollAt: worker.lastPoll?.finishedAt ?? null,
      nextPollAt: worker.nextPollAt,
      lastPoll: worker.lastPoll,
      pollCount: worker.pollCount,
      errorCount: worker.errorCount,
      lastUid: readImapState().lastUid,
    },
    weather: {
      provider: env.WEATHER_PROVIDER,
      commercial: !!env.OPEN_METEO_API_KEY,
      lastRun: weatherStatus.lastRun,
      lastError: weatherStatus.lastError,
      cells: weatherStatus.cells,
      calls: weatherStatus.calls,
    },
    regional: {
      enabled: regionalEnabled(),
      minHouseholds: env.REGIONAL_MIN_HOUSEHOLDS,
      ...regionalCounts(db),
    },
    extractors: allExtractors.map((ex) => {
      const llm = ex.name.startsWith('llm');
      return {
        name: ex.name,
        model: llm ? env.ANTHROPIC_MODEL : null,
        ready: llm ? isLlmConfigured(env) : true,
      };
    }),
  };
  return { household, install };
}
