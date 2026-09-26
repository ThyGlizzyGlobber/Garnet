import fs from 'node:fs';
import path from 'node:path';
import { getEnv, isUpdateCheckConfigured, type Env } from './env';
import { ensureDataDirs } from './paths';

/**
 * Self-update, operator side.
 *
 * The release workflow builds an image per commit on GitHub and stamps the
 * commit into it (APP_COMMIT). "Update now" only writes a request file into
 * DATA_DIR/config; a cron job on the NAS (deploy/nas-updater.sh) consumes it,
 * snapshots the data dataset, pulls the new image and redeploys. The app never
 * holds credentials that could control the NAS.
 */

export const UPDATE_REQUEST_FILE = 'update-request.json';
/** App-owned record of the last request; the NAS never touches it. */
const LAST_REQUEST_FILE = 'update-last.json';

export interface Build {
  commit: string;
  builtAt: string | null;
}

export interface PendingCommit {
  sha: string;
  message: string;
  date: string | null;
}

export type UpdateCheck =
  | { state: 'unconfigured' }
  | { state: 'error'; message: string }
  | { state: 'current'; latest: string }
  | {
      state: 'available';
      latest: string;
      latestAt: string | null;
      commits: PendingCommit[];
      total: number;
    };

export interface UpdateRequest {
  requestedAt: string;
  requestedBy: string;
  fromCommit: string;
}

export function currentBuild(env: Env = getEnv()): Build {
  return { commit: env.APP_COMMIT, builtAt: env.APP_BUILT_AT ?? null };
}

export function shortSha(sha: string): string {
  return /^[0-9a-f]{7,40}$/i.test(sha) ? sha.slice(0, 7) : sha;
}

/** Latest commit on the branch whose release workflow succeeded, i.e. one with a published image. */
export function parseLatestRun(json: unknown): { sha: string; at: string | null } | null {
  const runs = (json as { workflow_runs?: { head_sha?: string; updated_at?: string }[] })
    ?.workflow_runs;
  const run = runs?.[0];
  return run?.head_sha ? { sha: run.head_sha, at: run.updated_at ?? null } : null;
}

/** Commits between the running build and the latest release, newest first. */
export function parseCompare(json: unknown): {
  status: string;
  total: number;
  commits: PendingCommit[];
} {
  const c = json as {
    status?: string;
    ahead_by?: number;
    commits?: { sha: string; commit?: { message?: string; author?: { date?: string } } }[];
  };
  const commits = (c.commits ?? [])
    .map((x) => ({
      sha: x.sha,
      message: (x.commit?.message ?? '').split('\n')[0]?.trim() ?? '',
      date: x.commit?.author?.date ?? null,
    }))
    .reverse();
  return { status: c.status ?? 'unknown', total: c.ahead_by ?? commits.length, commits };
}

const CACHE_MS = 2 * 60_000;
let cache: { at: number; value: UpdateCheck } | undefined;

export async function checkForUpdate(
  opts: { env?: Env; fetchImpl?: typeof fetch; fresh?: boolean } = {},
): Promise<UpdateCheck> {
  const env = opts.env ?? getEnv();
  if (!isUpdateCheckConfigured(env)) return { state: 'unconfigured' };
  if (!opts.fresh && cache && Date.now() - cache.at < CACHE_MS) return cache.value;

  const f = opts.fetchImpl ?? fetch;
  const api = `https://api.github.com/repos/${env.UPDATE_REPO}`;
  const headers = {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${env.UPDATE_GITHUB_TOKEN}`,
    'X-GitHub-Api-Version': '2022-11-28',
  };
  const get = async (url: string) => {
    const res = await f(url, { headers, signal: AbortSignal.timeout(10_000) });
    if (!res.ok) throw new Error(`GitHub answered ${res.status} for ${url.replace(api, '')}`);
    return res.json();
  };

  let value: UpdateCheck;
  try {
    const latest = parseLatestRun(
      await get(
        `${api}/actions/workflows/${encodeURIComponent(env.UPDATE_WORKFLOW)}/runs?branch=${encodeURIComponent(env.UPDATE_BRANCH)}&status=success&per_page=1`,
      ),
    );
    const current = env.APP_COMMIT;
    if (!latest) {
      value = { state: 'error', message: 'No successful release build found on GitHub yet.' };
    } else if (latest.sha === current) {
      value = { state: 'current', latest: latest.sha };
    } else if (current === 'dev') {
      // Local build: nothing to compare against, but the latest release is still installable.
      value = {
        state: 'available',
        latest: latest.sha,
        latestAt: latest.at,
        commits: [],
        total: 0,
      };
    } else {
      const cmp = parseCompare(await get(`${api}/compare/${current}...${latest.sha}`));
      value =
        cmp.status === 'ahead' || cmp.status === 'diverged'
          ? {
              state: 'available',
              latest: latest.sha,
              latestAt: latest.at,
              commits: cmp.commits.slice(0, 8),
              total: cmp.total,
            }
          : { state: 'current', latest: latest.sha };
    }
  } catch (e) {
    value = { state: 'error', message: (e as Error).message };
  }
  cache = { at: Date.now(), value };
  return value;
}

function requestPath(dataDir?: string, file = UPDATE_REQUEST_FILE): string {
  return path.join(ensureDataDirs(dataDir).config, file);
}

function readJson<T>(file: string): T | null {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as T;
  } catch {
    return null;
  }
}

/** Ask the NAS to pull the latest image and redeploy. The cron job deletes the file when it picks it up. */
export function requestUpdate(requestedBy: string, dataDir?: string): UpdateRequest {
  const req: UpdateRequest = {
    requestedAt: new Date().toISOString(),
    requestedBy,
    fromCommit: getEnv().APP_COMMIT,
  };
  const json = JSON.stringify(req, null, 2);
  fs.writeFileSync(requestPath(dataDir), json);
  fs.writeFileSync(requestPath(dataDir, LAST_REQUEST_FILE), json);
  cache = undefined;
  return req;
}

/** The request still waiting for the NAS, or null once it has been picked up (or none was made). */
export function pendingUpdateRequest(dataDir?: string): UpdateRequest | null {
  return readJson<UpdateRequest>(requestPath(dataDir));
}

/** The most recent request, kept after the NAS has consumed it. */
export function lastUpdateRequest(dataDir?: string): UpdateRequest | null {
  return readJson<UpdateRequest>(requestPath(dataDir, LAST_REQUEST_FILE));
}

/** How long the settings page keeps watching for the new version after a request. */
export const UPDATE_WATCH_MS = 15 * 60_000;

/**
 * Where the last request stands: still queued for the NAS, being applied
 * (picked up, same version still running), done (running a newer build), or none.
 */
export function updateProgress(
  now = Date.now(),
  dataDir?: string,
): { state: 'none' } | { state: 'queued' | 'applying' | 'done'; request: UpdateRequest } {
  const last = lastUpdateRequest(dataDir);
  if (!last) return { state: 'none' };
  if (last.fromCommit !== getEnv().APP_COMMIT) return { state: 'done', request: last };
  if (pendingUpdateRequest(dataDir)) return { state: 'queued', request: last };
  if (now - Date.parse(last.requestedAt) < UPDATE_WATCH_MS)
    return { state: 'applying', request: last };
  return { state: 'none' };
}

export function cancelUpdateRequest(dataDir?: string): void {
  fs.rmSync(requestPath(dataDir), { force: true });
  fs.rmSync(requestPath(dataDir, LAST_REQUEST_FILE), { force: true });
}
