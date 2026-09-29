import { getEnv, isImapConfigured } from '@/lib/env';
import { pollMailbox, type PollResult } from '@/ingest/imap/poller';
import { settleAutoPaidBills } from '@/lib/autopay';
import { refileAll } from '@/lib/filing';
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
  __hudPoll?: Promise<PollResult>;
  __hudReminders?: NodeJS.Timeout;
  __hudWeather?: NodeJS.Timeout;
  __hudRegional?: NodeJS.Timeout;
};

/**
 * Every 15 minutes: auto-pay, busy AI retries, due-date reminders (each sent
 * once, notification_log), season-ahead emails and keeping the NAS filing in
 * step. Each step has its own error handling, so one failing never stops the
 * others.
 */
const QUARTER_HOURLY: { name: string; run: () => number | Promise<number>; done: string }[] = [
  {
    name: 'autopay',
    run: () => settleAutoPaidBills(),
    done: 'marked {n} bill(s) paid to the provider',
  },
  {
    name: 'ingest',
    run: () => retryBusyReads(),
    done: 're-read {n} document(s) the AI was too busy for',
  },
  { name: 'reminders', run: () => sendDueReminders(), done: 'sent {n}' },
  { name: 'seasons', run: () => sendSeasonAhead(), done: 'sent {n} season-ahead email(s)' },
  // Bills edited, services renamed, bills moved: keep the NAS filing in step.
  { name: 'filing', run: () => refileAll(), done: 'filed {n} document(s)' },
];

function startReminders(): void {
  if (g.__hudReminders) return;
  let busy = false;
  const tick = async () => {
    if (busy) return;
    busy = true;
    for (const step of QUARTER_HOURLY) {
      try {
        const n = await step.run();
        if (n) console.log(`[${step.name}] ${step.done.replace('{n}', String(n))}`);
      } catch (e) {
        console.error(`[${step.name}]`, (e as Error).message);
      }
    }
    busy = false;
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
export function pollNow(): Promise<PollResult> {
  // A poll already running (even the very first): wait for it rather than start another.
  g.__hudPoll ??= (async () => {
    const s = state();
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
      g.__hudPoll = undefined;
    }
  })();
  return g.__hudPoll;
}

/** Weather for households with a postcode: every 30 minutes, first run soon after start. */
function startWeather(): void {
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
function startRegional(): void {
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
