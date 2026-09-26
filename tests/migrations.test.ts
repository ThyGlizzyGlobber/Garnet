import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runMigrations } from '@/db/migrate';

/**
 * 0002_multi_household rebuilds every household-owned table. Build a database
 * as it was at 0001 (one household, paid shares, splits, a document), upgrade
 * it, and check nothing was lost or cascaded away.
 */
const repoMigrations = path.join(process.cwd(), 'drizzle');
let dir: string;
let oldMigrations: string;

function migrationsUpTo(tag: string): string {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'hud-migs-'));
  fs.mkdirSync(path.join(out, 'meta'));
  const journal = JSON.parse(
    fs.readFileSync(path.join(repoMigrations, 'meta', '_journal.json'), 'utf8'),
  ) as { entries: { tag: string }[] };
  const keep = journal.entries.slice(0, journal.entries.findIndex((e) => e.tag === tag) + 1);
  for (const e of keep)
    fs.copyFileSync(path.join(repoMigrations, `${e.tag}.sql`), path.join(out, `${e.tag}.sql`));
  fs.writeFileSync(
    path.join(out, 'meta', '_journal.json'),
    JSON.stringify({ ...journal, entries: keep }),
  );
  return out;
}

const counts = (file: string) => {
  const db = new Database(file, { readonly: true });
  const n = (t: string) => (db.prepare(`SELECT count(*) AS n FROM ${t}`).get() as { n: number }).n;
  const out = {
    household: n('household'),
    member: n('member'),
    service: n('service'),
    service_split: n('service_split'),
    source_document: n('source_document'),
    bill: n('bill'),
    share: n('share'),
    paid: n('share WHERE paid_at IS NOT NULL'),
    projection: n('projection'),
  };
  db.close();
  return out;
};

beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hud-migrate-'));
  oldMigrations = migrationsUpTo('0001_phase1_core');
  runMigrations(dir, oldMigrations);
  const db = new Database(path.join(dir, 'db', 'utilities.sqlite'));
  const t = '2026-09-01T00:00:00Z';
  db.exec(`
    INSERT INTO household (id, name, currency, locale, timezone, created_at, updated_at)
      VALUES ('H1', 'Smith Household', 'AUD', 'en-AU', 'Australia/Melbourne', '${t}', '${t}');
    INSERT INTO member (id, name, pin_hash, active_from, created_at, updated_at) VALUES
      ('M1', 'Bejay', 'x', '2026-01-01', '${t}', '${t}'),
      ('M2', 'Sam', 'x', '2026-01-01', '${t}', '${t}');
    INSERT INTO service (id, type_slug, name, provider, split_mode, payer_member_id, created_at, updated_at)
      VALUES ('S1', 'internet', 'Internet', 'Aussie Broadband', 'custom', 'M1', '${t}', '${t}');
    INSERT INTO service_split (service_id, member_id, weight) VALUES ('S1', 'M1', 2), ('S1', 'M2', 1);
    INSERT INTO source_document (id, kind, path, sha256, size_bytes, received_at, created_at)
      VALUES ('D1', 'pdf', '2026/09/D1.pdf', 'abc', 10, '${t}', '${t}');
    INSERT INTO bill (id, service_id, source_document_id, amount_minor, currency, period_start, period_end, due_date, source, created_at, updated_at)
      VALUES ('B1', 'S1', 'D1', 12900, 'AUD', '2026-09-01', '2026-09-30', '2026-09-15', 'template', '${t}', '${t}');
    INSERT INTO share (id, bill_id, member_id, amount_minor, currency, basis_weight, basis_days, period_days, paid_at, paid_method, created_at, updated_at) VALUES
      ('SH1', 'B1', 'M1', 8600, 'AUD', 2, 30, 30, '${t}', 'payer', '${t}', '${t}'),
      ('SH2', 'B1', 'M2', 4300, 'AUD', 1, 30, 30, '${t}', 'transfer', '${t}', '${t}');
    INSERT INTO projection (id, service_id, period_month, estimated_minor, currency, method, computed_at)
      VALUES ('P1', 'S1', '2026-10', 12900, 'AUD', 'recent', '${t}');
  `);
  db.close();
});

afterAll(() => {
  fs.rmSync(dir, { recursive: true, force: true });
  fs.rmSync(oldMigrations, { recursive: true, force: true });
});

describe('0002_multi_household', () => {
  it('keeps every row, including paid shares, and assigns them to the existing household', () => {
    const file = path.join(dir, 'db', 'utilities.sqlite');
    const before = counts(file);
    runMigrations(dir, repoMigrations);
    expect(counts(file)).toEqual(before);

    const db = new Database(file, { readonly: true });
    for (const table of [
      'member',
      'service',
      'service_split',
      'source_document',
      'bill',
      'share',
      'projection',
    ]) {
      const orphans = db
        .prepare(`SELECT count(*) AS n FROM ${table} WHERE household_id IS NOT 'H1'`)
        .get() as { n: number };
      expect(orphans.n, table).toBe(0);
    }
    expect(db.pragma('foreign_key_check')).toEqual([]);
    expect(db.prepare('SELECT is_demo FROM household').get()).toEqual({ is_demo: 0 });
    db.close();
  });

  it('keeps a copy of the database from before the migration', () => {
    const backups = fs
      .readdirSync(path.join(dir, 'db'))
      .filter((f) => f.startsWith('utilities.pre-migrate-'));
    expect(backups).toHaveLength(1);
    const old = new Database(path.join(dir, 'db', backups[0]!), { readonly: true });
    const cols = old.prepare('PRAGMA table_info(member)').all() as { name: string }[];
    expect(cols.map((c) => c.name)).not.toContain('household_id');
    old.close();
  });

  it('is a no-op the second time (no new backup)', () => {
    runMigrations(dir, repoMigrations);
    const backups = fs
      .readdirSync(path.join(dir, 'db'))
      .filter((f) => f.startsWith('utilities.pre-migrate-'));
    expect(backups).toHaveLength(1);
  });

  it('does not back up a brand-new database', () => {
    const fresh = fs.mkdtempSync(path.join(os.tmpdir(), 'hud-fresh-'));
    runMigrations(fresh, repoMigrations);
    expect(fs.readdirSync(path.join(fresh, 'db')).some((f) => f.includes('pre-migrate'))).toBe(
      false,
    );
    fs.rmSync(fresh, { recursive: true, force: true });
  });
});
