import fs from 'node:fs';
import path from 'node:path';
import { ensureDataDirs } from '@/lib/paths';

/**
 * One-off upgrade steps (backfills, clean-ups after a change of rule), each run
 * once per install and recorded in DATA_DIR/config/upgrades.json. An install
 * updated from any older version gets every step exactly once, in order, and
 * nothing repeats on every start. Add new steps to the end of the list in
 * src/worker/startup.ts; never rename one that has shipped.
 */
const FILE = 'upgrades.json';

type Done = Record<string, string>;

function file(dataDir?: string): string {
  return path.join(ensureDataDirs(dataDir).config, FILE);
}

export function upgradesDone(dataDir?: string): Done {
  try {
    return JSON.parse(fs.readFileSync(file(dataDir), 'utf8')) as Done;
  } catch {
    return {};
  }
}

/** Run `step` unless it has run on this install; returns its result, or null when skipped. */
export function runOnce<T>(name: string, step: () => T, dataDir?: string): T | null {
  const done = upgradesDone(dataDir);
  if (done[name]) return null;
  const result = step();
  fs.writeFileSync(
    file(dataDir),
    JSON.stringify({ ...done, [name]: new Date().toISOString() }, null, 2),
  );
  return result;
}
