import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { openDb, type Db } from '@/db/client';
import { runMigrations } from '@/db/migrate';
import { adoptLegacyDemoFlag } from '@/lib/demo';
import { createHousehold, getHousehold } from '@/lib/households';
import { dataPaths } from '@/lib/paths';
import { runOnce, upgradesDone } from '@/lib/upgrades';

let dir: string;
let db: Db;
let close: () => void;

beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hud-upgrades-'));
  runMigrations(dir);
  const opened = openDb(dir);
  db = opened.db;
  close = () => opened.sqlite.close();
});

afterAll(() => {
  close();
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('one-off upgrade steps', () => {
  it('run once per install and are recorded', () => {
    let runs = 0;
    expect(runOnce('step a', () => ++runs, dir)).toBe(1);
    expect(runOnce('step a', () => ++runs, dir)).toBeNull();
    expect(runOnce('step b', () => ++runs, dir)).toBe(2);
    expect(Object.keys(upgradesDone(dir))).toEqual(['step a', 'step b']);
  });
});

describe('the legacy demo flag', () => {
  const flag = () => path.join(dataPaths().config, 'demo.json');
  const hh = (name: string) =>
    createHousehold(
      {
        name,
        currency: 'AUD',
        locale: 'en-AU',
        timezone: 'Australia/Melbourne',
        fiscalYearStartMonth: 7,
        splitMode: 'shared',
      },
      db,
    );

  it('never marks real households when more than one exists', () => {
    const a = hh('Real one');
    const b = hh('Real two');
    fs.mkdirSync(path.dirname(flag()), { recursive: true });
    fs.writeFileSync(flag(), '{}');
    adoptLegacyDemoFlag(db);
    expect(getHousehold(a.id, db)?.isDemo).toBe(false);
    expect(getHousehold(b.id, db)?.isDemo).toBe(false);
    expect(fs.existsSync(flag())).toBe(false);
  });
});

describe('pre-migration copies', () => {
  it('keeps only the latest five', () => {
    const dbDir = dataPaths(dir).dbDir;
    for (let i = 0; i < 8; i++)
      fs.writeFileSync(path.join(dbDir, `utilities.pre-migrate-2026-01-0${i + 1}.sqlite`), '');
    // A fresh migration folder with one more entry than applied triggers a copy.
    const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'hud-mig-'));
    fs.cpSync(path.join(process.cwd(), 'drizzle'), folder, { recursive: true });
    const journal = path.join(folder, 'meta', '_journal.json');
    const j = JSON.parse(fs.readFileSync(journal, 'utf8')) as { entries: { tag: string }[] };
    const last = j.entries[j.entries.length - 1]!;
    j.entries.push({ ...last, idx: j.entries.length, when: Date.now(), tag: '9999_test' } as never);
    fs.writeFileSync(journal, JSON.stringify(j));
    fs.writeFileSync(path.join(folder, '9999_test.sql'), 'SELECT 1;');
    runMigrations(dir, folder);
    const copies = fs.readdirSync(dbDir).filter((f) => f.includes('pre-migrate'));
    expect(copies).toHaveLength(5);
    expect(copies).not.toContain('utilities.pre-migrate-2026-01-01.sqlite');
    fs.rmSync(folder, { recursive: true, force: true });
  });
});
