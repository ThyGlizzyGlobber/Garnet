import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { parseEnv, resetEnvCache } from '@/lib/env';
import {
  UPDATE_REQUEST_FILE,
  cancelUpdateRequest,
  checkForUpdate,
  parseCompare,
  parseLatestRun,
  pendingUpdateRequest,
  requestUpdate,
  shortSha,
  updateProgress,
} from '@/lib/updates';

const A = 'a'.repeat(40);
const B = 'b'.repeat(40);
const base = { AUTH_SECRET: 'x'.repeat(32) };
const configured = parseEnv({
  ...base,
  APP_COMMIT: A,
  UPDATE_REPO: 'owner/repo',
  UPDATE_GITHUB_TOKEN: 'token',
});

function fakeFetch(routes: Record<string, unknown>, status = 200): typeof fetch {
  return (async (url: string | URL) => {
    const key = Object.keys(routes).find((k) => String(url).includes(k));
    if (!key) return new Response('not found', { status: 404 });
    return new Response(JSON.stringify(routes[key]), { status });
  }) as typeof fetch;
}

const runs = (sha: string) => ({
  workflow_runs: [{ head_sha: sha, updated_at: '2026-09-26T01:00:00Z' }],
});

describe('GitHub response parsing', () => {
  it('takes the newest successful run', () => {
    expect(parseLatestRun(runs(B))).toEqual({ sha: B, at: '2026-09-26T01:00:00Z' });
    expect(parseLatestRun({ workflow_runs: [] })).toBeNull();
    expect(parseLatestRun(null)).toBeNull();
  });

  it('lists compare commits newest first with first-line messages', () => {
    const cmp = parseCompare({
      status: 'ahead',
      ahead_by: 2,
      commits: [
        { sha: '1', commit: { message: 'Older\n\nbody', author: { date: 'd1' } } },
        { sha: '2', commit: { message: 'Newer', author: { date: 'd2' } } },
      ],
    });
    expect(cmp.total).toBe(2);
    expect(cmp.commits.map((c) => c.message)).toEqual(['Newer', 'Older']);
  });

  it('shortens only real hashes', () => {
    expect(shortSha(A)).toBe('aaaaaaa');
    expect(shortSha('dev')).toBe('dev');
  });
});

describe('checkForUpdate', () => {
  it('is unconfigured without repo and token', async () => {
    expect(await checkForUpdate({ env: parseEnv(base), fresh: true })).toEqual({
      state: 'unconfigured',
    });
  });

  it('reports current when the latest release is the running commit', async () => {
    const res = await checkForUpdate({
      env: configured,
      fresh: true,
      fetchImpl: fakeFetch({ '/actions/workflows/': runs(A) }),
    });
    expect(res).toEqual({ state: 'current', latest: A });
  });

  it('lists pending commits when a newer release exists', async () => {
    const res = await checkForUpdate({
      env: configured,
      fresh: true,
      fetchImpl: fakeFetch({
        '/actions/workflows/': runs(B),
        [`/compare/${A}...${B}`]: {
          status: 'ahead',
          ahead_by: 1,
          commits: [{ sha: B, commit: { message: 'Invites' } }],
        },
      }),
    });
    expect(res.state).toBe('available');
    if (res.state === 'available') {
      expect(res.total).toBe(1);
      expect(res.commits[0]?.message).toBe('Invites');
    }
  });

  it('treats a running build newer than the release as current', async () => {
    const res = await checkForUpdate({
      env: configured,
      fresh: true,
      fetchImpl: fakeFetch({ '/actions/workflows/': runs(B), '/compare/': { status: 'behind' } }),
    });
    expect(res.state).toBe('current');
  });

  it('surfaces GitHub errors instead of throwing', async () => {
    const res = await checkForUpdate({
      env: configured,
      fresh: true,
      fetchImpl: fakeFetch({ '/actions/workflows/': {} }, 401),
    });
    expect(res.state).toBe('error');
  });
});

describe('update requests', () => {
  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hud-upd-'));
    process.env.APP_COMMIT = A;
    resetEnvCache();
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
    delete process.env.APP_COMMIT;
    resetEnvCache();
  });

  it('writes a request the NAS consumes, then tracks progress', () => {
    requestUpdate('Alex', dir);
    expect(pendingUpdateRequest(dir)?.fromCommit).toBe(A);
    expect(updateProgress(Date.now(), dir).state).toBe('queued');

    // The cron job deletes the request when it starts applying the update.
    fs.rmSync(path.join(dir, 'config', UPDATE_REQUEST_FILE));
    expect(updateProgress(Date.now(), dir).state).toBe('applying');
    expect(updateProgress(Date.now() + 60 * 60_000, dir).state).toBe('none');

    // The new container runs a different commit.
    process.env.APP_COMMIT = B;
    resetEnvCache();
    expect(updateProgress(Date.now(), dir).state).toBe('done');
  });

  it('can be cancelled before the NAS picks it up', () => {
    requestUpdate('Alex', dir);
    cancelUpdateRequest(dir);
    expect(pendingUpdateRequest(dir)).toBeNull();
    expect(updateProgress(Date.now(), dir).state).toBe('none');
  });
});
