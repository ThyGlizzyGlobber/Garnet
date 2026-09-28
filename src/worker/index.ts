import { getEnv, isImapConfigured } from '@/lib/env';
import { pollMailbox, type PollResult } from '@/ingest/imap/poller';
import { settleAutoPaidBills } from '@/lib/autopay';
import { sendDueReminders, sendSeasonAhead } from '@/lib/notifications';
import { retryBusyReads } from '@/ingest/pipeline';
import { syncWeather } from '@/lib/weather';
import { computeRegionalStats, regionalEnabled } from '@/lib/regional';
import { weatherProvider } from '@/weather';

export interface WorkerStatus {
  enabled: boolean;
  intervalSeconds: number;
  running: boolean;
  lastPoll: PollResult | null;
  nextPollAt: string | null;
  pollCount: number;
  errorCount: number;
}

interface WorkerState extends WorkerStatus {
  timer: NodeJS.Timeout | null;
}

// Survives Next.js hot reloads in dev; one poller per process.
const g = globalThis as unknown as {
  __hudWorker?: WorkerState;
  __hudReminders?: NodeJS.Timeout;
  __hudWeather?: NodeJS.Timeout;
  __hudRegional?: NodeJS.Timeout;
};

/** Due-date reminders: checked every 15 minutes; each reminder is sent once (notification_log). */
export function startReminders(): void {
  if (g.__hudReminders) return;
  let busy = false;
  const tick = () => {
    if (busy) return;
    busy = true;
    Promise.resolve()
      .then(() => {
        const settled = settleAutoPaidBills();
        if (settled) console.log(`[autopay] marked ${settled} bill(s) paid to the provider`);
        return retryBusyReads();
      })
      .then((n) => {
        if (n) console.log(`[ingest] re-read ${n} document(s) the AI was too busy for`);
        return sendDueReminders();
      })
      .then((n) => n && console.log(`[reminders] sent ${n}`))
      .then(() => sendSeasonAhead())
      .then((n) => n && console.log(`[seasons] sent ${n} season-ahead email(s)`))
      .catch((e) => console.error('[reminders]', (e as Error).message))
      .finally(() => {
        busy = false;
      });
  };
  setTimeout(tick, 60_000).unref();
  g.__hudReminders = setInterval(tick, 15 * 60_000);
  g.__hudReminders.unref();
}

function state(): WorkerState {
  g.__hudWorker ??= {
    enabled: false,
    intervalSeconds: 0,
    running: false,
    lastPoll: null,
    nextPollAt: null,
    pollCount: 0,
    errorCount: 0,
    timer: null,
  };
  return g.__hudWorker;
}

export function workerStatus(): WorkerStatus {
  const { timer: _timer, ...rest } = state();
  void _timer;
  return rest;
}

/** Run one poll now (used by the timer and the "poll now" button). Serialised. */
export async function pollNow(): Promise<PollResult> {
  const s = state();
  if (s.running && s.lastPoll) return s.lastPoll;
  s.running = true;
  try {
    const r = await pollMailbox();
    s.lastPoll = r;
    s.pollCount++;
    if (r.error) s.errorCount++;
    return r;
  } finally {
    s.running = false;
    if (s.timer) s.nextPollAt = new Date(Date.now() + s.intervalSeconds * 1000).toISOString();
  }
}

/** Weather for households with a postcode: every 30 minutes, first run soon after start. */
export function startWeather(): void {
  if (g.__hudWeather) return;
  let busy = false;
  const tick = () => {
    if (busy) return;
    busy = true;
    syncWeather(weatherProvider())
      .then((r) => {
        if (r.calls || r.filled)
          console.log(`[weather] ${r.calls} call(s), ${r.filled} bill(s) given their weather`);
      })
      .catch((e) => console.error('[weather]', (e as Error).message))
      .finally(() => {
        busy = false;
      });
  };
  setTimeout(tick, 20_000).unref();
  g.__hudWeather = setInterval(tick, 30 * 60_000);
  g.__hudWeather.unref();
}

/** Area figures (scope S4): recomputed every six hours, first a minute after start. */
export function startRegional(): void {
  if (g.__hudRegional) return;
  const tick = () => {
    if (!regionalEnabled()) return;
    try {
      const r = computeRegionalStats();
      console.log(`[regional] ${r.households} sharing household(s), ${r.rows} area figure(s)`);
    } catch (e) {
      console.error('[regional]', (e as Error).message);
    }
  };
  setTimeout(tick, 60_000).unref();
  g.__hudRegional = setInterval(tick, 6 * 3_600_000);
  g.__hudRegional.unref();
}

export function startWorker(): void {
  startReminders();
  startWeather();
  startRegional();
  const env = getEnv();
  const s = state();
  if (s.timer) return;
  s.intervalSeconds = env.IMAP_POLL_INTERVAL_SECONDS;
  s.enabled = isImapConfigured(env) && env.IMAP_POLL_INTERVAL_SECONDS > 0;
  if (!s.enabled) return;
  const tick = () => {
    pollNow().catch(() => undefined);
  };
  // First poll shortly after boot, then on the interval.
  setTimeout(tick, 5_000);
  s.timer = setInterval(tick, s.intervalSeconds * 1000);
  s.timer.unref();
  s.nextPollAt = new Date(Date.now() + 5_000).toISOString();
  console.log(`[worker] IMAP poller started, every ${s.intervalSeconds}s`);
}

export function stopWorker(): void {
  const s = state();
  if (s.timer) clearInterval(s.timer);
  s.timer = null;
  s.enabled = false;
  s.nextPollAt = null;
}
