import fs from 'node:fs';
import path from 'node:path';
import { getEnv } from './env';

/**
 * Layout of the mounted data directory (DATA_DIR):
 *   db/utilities.sqlite   — the SQLite database
 *   inbox/                — raw bill emails/PDFs, kept forever (audit trail)
 *   config/               — runtime config files (none yet)
 */
export function dataPaths(dataDir: string = getEnv().DATA_DIR) {
  const root = path.resolve(dataDir);
  return {
    root,
    dbDir: path.join(root, 'db'),
    dbFile: path.join(root, 'db', 'utilities.sqlite'),
    inbox: path.join(root, 'inbox'),
    config: path.join(root, 'config'),
  };
}

/** Create the data directory tree if it doesn't exist. Safe to call repeatedly. */
export function ensureDataDirs(dataDir?: string) {
  const p = dataPaths(dataDir);
  for (const dir of [p.root, p.dbDir, p.inbox, p.config]) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return p;
}
