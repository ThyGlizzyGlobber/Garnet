import { and, count, eq, isNotNull } from 'drizzle-orm';
import { getDb, type Db } from '@/db/client';
import { bill } from '@/db/schema';
import { allExtractors } from '@/ingest/extractors';
import { householdBoundSince } from '@/ingest/inbound';
import { getEnv, isInboundEmailConfigured, isLlmConfigured } from '@/lib/env';
import { listAccounts } from '@/lib/accounts';
import { regionalCounts, regionalEnabled } from '@/lib/regional';
import { documentCounts, ingestionStats } from '@/lib/review';
import { aiAllowance } from '@/lib/usage';
import { weatherStatus } from '@/lib/weather';

/**
 * Everything the status page shows. The household's own reading figures are
 * for every member; `install` (bills addresses, weather service, area figures, the
 * reader's model) describes the whole install, so only developers get it.
 */
export function statusView(
  householdId: string,
  memberId: string,
  developer: boolean,
  db: Db = getDb(),
) {
  const env = getEnv();
  const counts = documentCounts(householdId, { viewer: memberId }, db);
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
  if (!developer) return { household, install: null };

  const install = {
    billsAddresses: {
      configured: isInboundEmailConfigured(env),
      /** When the email Worker started signing each household's address (null: not yet). */
      householdBoundSince: householdBoundSince(),
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
    /** Everyone who has signed in, newest first (the record of sign-ups). */
    accounts: listAccounts(db),
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
