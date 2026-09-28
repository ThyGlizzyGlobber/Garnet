import { getEnv, isImapConfigured } from '@/lib/env';
import { pollMailbox, type PollResult } from '@/ingest/imap/poller';
import { settleAutoPaidBills } from '@/lib/autopay';
import { sendDueReminders } from '@/lib/notifications';
import { retryBusyReads } from '@/ingest/pipeline';

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
const g = globalThis as unknown as { __hudWorker?: WorkerState; __hudReminders?: NodeJS.Timeout };

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

export function startWorker(): void {
  startReminders();
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
