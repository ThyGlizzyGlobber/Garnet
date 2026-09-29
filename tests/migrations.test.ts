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
    ]) {
      const orphans = db
        .prepare(`SELECT count(*) AS n FROM ${table} WHERE household_id IS NOT 'H1'`)
        .get() as { n: number };
      expect(orphans.n, table).toBe(0);
    }
    expect(db.pragma('foreign_key_check')).toEqual([]);
    expect(db.prepare('SELECT is_demo FROM household').get()).toEqual({ is_demo: 0 });
    // 0030: the projection cache nobody read is gone.
    expect(
      db
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'projection'")
        .get(),
    ).toBeUndefined();
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

describe('0018 instalments, 0019–0022 service types and names', () => {
  it('re-file council and insurance services and keep existing shares whole', () => {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'hud-migrate-19-'));
    const upTo17 = migrationsUpTo('0017_regional');
    try {
      runMigrations(d, upTo17);
      const file = path.join(d, 'db', 'utilities.sqlite');
      const db = new Database(file);
      const t = '2026-09-01T00:00:00Z';
      db.exec(`
        INSERT INTO household (id, name, currency, locale, timezone, created_at, updated_at)
          VALUES ('H1', 'Smith Household', 'AUD', 'en-AU', 'Australia/Melbourne', '${t}', '${t}');
        INSERT INTO member (id, household_id, name, active_from, created_at, updated_at)
          VALUES ('M1', 'H1', 'Jo', '2026-01-01', '${t}', '${t}');
        INSERT INTO service (id, household_id, type_slug, name, provider, created_at, updated_at) VALUES
          ('S1', 'H1', 'other', 'Rates', 'City of Riverside', '${t}', '${t}'),
          ('S2', 'H1', 'other', 'Council', 'Riverside Shire Council', '${t}', '${t}'),
          ('S3', 'H1', 'other', 'Home & contents', 'Example Insurance', '${t}', '${t}'),
          ('S4', 'H1', 'other', 'Gym', 'Example Fitness', '${t}', '${t}'),
          ('S5', 'H1', 'internet', 'Internet', 'Example Broadband', '${t}', '${t}'),
          ('S6', 'H1', 'other', 'Other', 'City of Greater Example', '${t}', '${t}'),
          ('S7', 'H1', 'other', 'Hospital & extras', 'Example Health Insurance', '${t}', '${t}'),
          ('S8', 'H1', 'other', 'Contents', 'Example Insurance', '${t}', '${t}'),
          ('S9', 'H1', 'other', 'Insurance', 'Example Mutual', '${t}', '${t}'),
          ('S10', 'H1', 'other', 'Other', 'Ambulance Example', '${t}', '${t}'),
          ('S11', 'H1', 'other', 'Lawns', 'Jo''s Mowing', '${t}', '${t}'),
          ('S12', 'H1', 'other', 'Cleaner', 'Sparkle Co', '${t}', '${t}'),
          ('S13', 'H1', 'other', 'Termite check', 'Example Services', '${t}', '${t}'),
          ('S14', 'H1', 'other', 'Pool', 'Blue Water', '${t}', '${t}'),
          ('S15', 'H1', 'other', 'Plumber', 'Example Plumbing', '${t}', '${t}'),
          ('S16', 'H1', 'other', 'Other', 'Example Roadside Club', '${t}', '${t}'),
          ('S17', 'H1', 'other', 'Other', 'Example Fitness', '${t}', '${t}'),
          ('S18', 'H1', 'other', 'Mechanic', 'Jo''s Garage', '${t}', '${t}');
        INSERT INTO bill (id, household_id, service_id, amount_minor, currency, period_start, period_end, due_date, source, created_at, updated_at)
          VALUES ('B1', 'H1', 'S5', 12900, 'AUD', '2026-09-01', '2026-09-30', '2026-09-15', 'manual', '${t}', '${t}');
        INSERT INTO share (id, household_id, bill_id, member_id, amount_minor, currency, basis_weight, basis_days, period_days, created_at, updated_at)
          VALUES ('SH1', 'H1', 'B1', 'M1', 12900, 'AUD', 1, 30, 30, '${t}', '${t}');
      `);
      db.close();
      runMigrations(d);
      const after = new Database(file, { readonly: true });
      const types = after
        .prepare('SELECT id, name, type_slug FROM service ORDER BY length(id), id')
        .all();
      // Re-filed, and a service named after its old type ("Other") takes the new name (0020).
      expect(types).toEqual([
        { id: 'S1', name: 'Rates', type_slug: 'council_rates' },
        { id: 'S2', name: 'Council', type_slug: 'council_rates' },
        // 0021: insurance splits into health, contents and building (home & contents → building).
        { id: 'S3', name: 'Home & contents', type_slug: 'building_insurance' },
        { id: 'S4', name: 'Gym', type_slug: 'gym' }, // 0026
        { id: 'S5', name: 'Internet', type_slug: 'internet' },
        { id: 'S6', name: 'Council rates', type_slug: 'council_rates' },
        { id: 'S7', name: 'Hospital & extras', type_slug: 'health_insurance' },
        { id: 'S8', name: 'Contents', type_slug: 'contents_insurance' },
        { id: 'S9', name: 'Insurance', type_slug: 'other' },
        // 0022: ambulance cover and home services (an "Other"-named service is renamed).
        { id: 'S10', name: 'Ambulance cover', type_slug: 'ambulance_cover' },
        { id: 'S11', name: 'Lawns', type_slug: 'gardening' },
        { id: 'S12', name: 'Cleaner', type_slug: 'cleaning' },
        { id: 'S13', name: 'Termite check', type_slug: 'pest_control' },
        { id: 'S14', name: 'Pool', type_slug: 'pool' },
        { id: 'S15', name: 'Plumber', type_slug: 'repairs' },
        // 0025: roadside assistance.
        { id: 'S16', name: 'Roadside assistance', type_slug: 'roadside_assistance' },
        // 0026: gym memberships and vehicle repairs & servicing.
        { id: 'S17', name: 'Gym membership', type_slug: 'gym' },
        { id: 'S18', name: 'Mechanic', type_slug: 'vehicle_maintenance' },
      ]);
      expect(after.prepare("SELECT slug FROM service_type WHERE slug = 'insurance'").get()).toBe(
        undefined,
      );
      expect(after.prepare('SELECT instalment, due_date FROM share').get()).toEqual({
        instalment: 0,
        due_date: null,
      });
      after.close();
    } finally {
      fs.rmSync(d, { recursive: true, force: true });
      fs.rmSync(upTo17, { recursive: true, force: true });
    }
  });
});

describe('0027 asks about services set up automatically', () => {
  it('asks about car rego and the like, and anything set up since personal services', () => {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'hud-migrate-27-'));
    const upTo26 = migrationsUpTo('0026_service_categories');
    try {
      runMigrations(d, upTo26);
      const file = path.join(d, 'db', 'utilities.sqlite');
      const db = new Database(file);
      const auto =
        'Set up automatically from its first bill. Check who pays it and how it’s split.';
      db.exec(`
        INSERT INTO household (id, name, currency, locale, timezone, created_at, updated_at)
          VALUES ('H1', 'Smith', 'AUD', 'en-AU', 'Australia/Melbourne', '2026-01-01', '2026-01-01');
        INSERT INTO household (id, name, currency, locale, timezone, split_mode, created_at, updated_at)
          VALUES ('H2', 'Solo', 'AUD', 'en-AU', 'Australia/Melbourne', 'single', '2026-01-01', '2026-01-01');
        INSERT INTO service (id, household_id, type_slug, name, provider, notes, created_at, updated_at) VALUES
          ('R1', 'H1', 'vehicle_registration', 'Rego', 'Roads', '${auto}', '2026-05-01', '2026-05-01'),
          ('O1', 'H1', 'other', 'Other', 'Roads', '${auto}', '2026-09-29T05:00:00Z', '2026-09-29'),
          ('E1', 'H1', 'electricity', 'Power', 'Energy', '${auto}', '2026-05-01', '2026-05-01'),
          ('M1', 'H1', 'vehicle_registration', 'Rego 2', 'Roads', 'typed by hand', '2026-05-01', '2026-05-01'),
          ('S1', 'H2', 'vehicle_registration', 'Rego', 'Roads', '${auto}', '2026-05-01', '2026-05-01');
      `);
      db.close();
      runMigrations(d);
      const after = new Database(file, { readonly: true });
      const asked = after
        .prepare('SELECT id FROM service WHERE owner_asked_at IS NOT NULL ORDER BY id')
        .all()
        .map((r) => (r as { id: string }).id);
      expect(asked).toEqual(['O1', 'R1']);
      after.close();
    } finally {
      fs.rmSync(d, { recursive: true, force: true });
      fs.rmSync(upTo26, { recursive: true, force: true });
    }
  });
});

describe('0028 asks in households that don’t split bills too', () => {
  it('asks when others live there, not when someone lives alone', () => {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'hud-migrate-28-'));
    const upTo27 = migrationsUpTo('0027_ask_owner');
    try {
      runMigrations(d, upTo27);
      const file = path.join(d, 'db', 'utilities.sqlite');
      const db = new Database(file);
      const auto = 'Set up automatically from its first bill.';
      db.exec(`
        INSERT INTO household (id, name, currency, locale, timezone, split_mode, created_at, updated_at) VALUES
          ('H1', 'Smith', 'AUD', 'en-AU', 'Australia/Melbourne', 'single', '2026-01-01', '2026-01-01'),
          ('H2', 'Alone', 'AUD', 'en-AU', 'Australia/Melbourne', 'single', '2026-01-01', '2026-01-01');
        INSERT INTO member (id, household_id, name, active_from, created_at, updated_at) VALUES
          ('M1', 'H1', 'Ray', '2026-01-01', '2026-01-01', '2026-01-01'),
          ('M2', 'H1', 'Mum', '2026-01-01', '2026-01-01', '2026-01-01'),
          ('M3', 'H2', 'Kim', '2026-01-01', '2026-01-01', '2026-01-01');
        INSERT INTO service (id, household_id, type_slug, name, provider, notes, created_at, updated_at) VALUES
          ('R1', 'H1', 'vehicle_registration', 'Rego', 'VicRoads', '${auto}', '2026-09-29T05:00:00Z', '2026-09-29'),
          ('R2', 'H2', 'vehicle_registration', 'Rego', 'VicRoads', '${auto}', '2026-09-29T05:00:00Z', '2026-09-29');
      `);
      db.close();
      runMigrations(d);
      const after = new Database(file, { readonly: true });
      const asked = after
        .prepare('SELECT id FROM service WHERE owner_asked_at IS NOT NULL ORDER BY id')
        .all()
        .map((r) => (r as { id: string }).id);
      expect(asked).toEqual(['R1']);
      after.close();
    } finally {
      fs.rmSync(d, { recursive: true, force: true });
      fs.rmSync(upTo27, { recursive: true, force: true });
    }
  });
});

describe('0029 splits by percentage and set amounts', () => {
  it('turns the old custom weights into percentages of the same proportions', () => {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'hud-migrate-29-'));
    const upTo28 = migrationsUpTo('0028_ask_owner_single');
    try {
      runMigrations(d, upTo28);
      const file = path.join(d, 'db', 'utilities.sqlite');
      const db = new Database(file);
      db.exec(`
        INSERT INTO household (id, name, currency, locale, timezone, split_mode, created_at, updated_at) VALUES
          ('H1', 'Share house', 'AUD', 'en-AU', 'Australia/Melbourne', 'shared', '2026-01-01', '2026-01-01');
        INSERT INTO member (id, household_id, name, active_from, created_at, updated_at) VALUES
          ('M1', 'H1', 'Jordan', '2026-01-01', '2026-01-01', '2026-01-01'),
          ('M2', 'H1', 'Sam', '2026-01-01', '2026-01-01', '2026-01-01');
        INSERT INTO service (id, household_id, type_slug, name, provider, split_mode, created_at, updated_at) VALUES
          ('S1', 'H1', 'rent', 'Rent', 'Agent', 'custom', '2026-01-01', '2026-01-01'),
          ('S2', 'H1', 'water', 'Water', 'Water Co', 'equal', '2026-01-01', '2026-01-01');
        INSERT INTO service_split (household_id, service_id, member_id, weight) VALUES
          ('H1', 'S1', 'M1', 2), ('H1', 'S1', 'M2', 1), ('H1', 'S2', 'M1', 5);
      `);
      db.close();
      runMigrations(d);
      const after = new Database(file, { readonly: true });
      const mode = (id: string) =>
        (
          after.prepare('SELECT split_mode FROM service WHERE id = ?').get(id) as {
            split_mode: string;
          }
        ).split_mode;
      expect(mode('S1')).toBe('percent');
      expect(mode('S2')).toBe('equal');
      const splits = after
        .prepare(
          'SELECT service_id, member_id, weight, amount_minor FROM service_split ORDER BY service_id, member_id',
        )
        .all();
      expect(splits).toEqual([
        { service_id: 'S1', member_id: 'M1', weight: 66.67, amount_minor: null },
        { service_id: 'S1', member_id: 'M2', weight: 33.33, amount_minor: null },
        { service_id: 'S2', member_id: 'M1', weight: 5, amount_minor: null },
      ]);
      after.close();
    } finally {
      fs.rmSync(d, { recursive: true, force: true });
      fs.rmSync(upTo28, { recursive: true, force: true });
    }
  });
});
