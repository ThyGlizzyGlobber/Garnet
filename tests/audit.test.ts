import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { openDb, type Db } from '@/db/client';
import { runMigrations } from '@/db/migrate';
import { audit, auditLines } from '@/lib/audit';

let dir: string;
let db: Db;
let close: () => void;

beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hud-audit-'));
  runMigrations(dir);
  const opened = openDb(dir);
  db = opened.db;
  close = () => opened.sqlite.close();
});

afterAll(() => {
  close();
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('the audit log (SCOPE-console.md C-D9)', () => {
  it('keeps every developer action, newest first, with who, what, on what and the facts', () => {
    audit(
      {
        accountId: 'a1',
        email: 'dev@example.com',
        action: 'early-access.on',
        targetKind: 'install',
      },
      db,
    );
    const second = audit(
      {
        accountId: 'a1',
        email: 'dev@example.com',
        action: 'household.cap',
        targetKind: 'household',
        targetId: 'h1',
        targetName: 'Riverside House',
        detail: { cap: 0 },
        ip: '10.0.0.2',
      },
      db,
    );
    const lines = auditLines(db);
    expect(lines).toHaveLength(2);
    expect(lines[0]!.id).toBe(second.id);
    expect(lines[0]).toMatchObject({
      email: 'dev@example.com',
      action: 'household.cap',
      targetName: 'Riverside House',
      detail: { cap: 0 },
      ip: '10.0.0.2',
    });
    expect(auditLines(db, { limit: 1, offset: 1 })[0]!.action).toBe('early-access.on');
  });
});
