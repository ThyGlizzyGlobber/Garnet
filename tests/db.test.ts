import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { openDb } from '@/db/client';
import { runMigrations } from '@/db/migrate';
import { household } from '@/db/schema';

let dir: string;

beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hud-test-'));
  runMigrations(dir);
});

afterAll(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('database', () => {
  it('creates the data directory tree and applies migrations', () => {
    expect(fs.existsSync(path.join(dir, 'db', 'utilities.sqlite'))).toBe(true);
    expect(fs.existsSync(path.join(dir, 'inbox'))).toBe(true);
    const { sqlite, db } = openDb(dir);
    const now = new Date().toISOString();
    db.insert(household)
      .values({
        id: 'h1',
        name: 'Test House',
        currency: 'AUD',
        locale: 'en-AU',
        timezone: 'Australia/Melbourne',
        fiscalYearStartMonth: 7,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    const rows = db.select().from(household).all();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.currency).toBe('AUD');
    expect(rows[0]?.weekStartsOn).toBe(1);
    sqlite.close();
  });
});
