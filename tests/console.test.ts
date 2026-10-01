import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { openDb, type Db } from '@/db/client';
import { runMigrations } from '@/db/migrate';
import { requestAccess } from '@/lib/access';
import { signInAccount } from '@/lib/accounts';
import { createBill } from '@/lib/bills';
import {
  householdRows,
  overview,
  setAiCap,
  storage,
  uncapDeveloperHouseholds,
} from '@/lib/console';
import { resetEnvCache } from '@/lib/env';
import { createHousehold } from '@/lib/households';
import { createMember } from '@/lib/members';
import { createService } from '@/lib/services';
import { aiAllowance } from '@/lib/usage';

let dir: string;
let db: Db;
let close: () => void;

beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hud-console-'));
  runMigrations(dir);
  const opened = openDb(dir);
  db = opened.db;
  close = () => opened.sqlite.close();
  process.env.DEVELOPER_EMAILS = 'dev@example.com';
  resetEnvCache();
});

afterAll(() => {
  close();
  fs.rmSync(dir, { recursive: true, force: true });
  delete process.env.DEVELOPER_EMAILS;
  resetEnvCache();
});

describe('the console (SCOPE-console.md C-D6)', () => {
  it('never imports a reader that could show a bill or a document', () => {
    const src = fs.readFileSync(path.resolve(import.meta.dirname, '../src/lib/console.ts'), 'utf8');
    const imports = [...src.matchAll(/from '([^']+)'/g)].map((m) => m[1]!);
    for (const forbidden of [
      '@/lib/bills',
      '@/lib/review',
      '@/lib/money',
      '@/ingest',
      '@/lib/bill-search',
      '@/lib/export',
    ])
      expect(
        imports.some((i) => i.startsWith(forbidden)),
        forbidden,
      ).toBe(false);
  });

  it('counts households, accounts, requests and bills this month, and says which households the viewer may open', () => {
    const dev = signInAccount({ email: 'dev@example.com' }, db);
    const other = signInAccount({ email: 'other@example.com' }, db);
    const hh = createHousehold(
      {
        name: 'Counted House',
        currency: 'AUD',
        locale: 'en-AU',
        timezone: 'Australia/Melbourne',
        fiscalYearStartMonth: 7,
        splitMode: 'shared',
      },
      db,
    );
    const me = createMember(
      hh.id,
      { name: 'Dev', role: 'owner', activeFrom: '2026-01-01', accountId: dev.id },
      db,
    );
    const power = createService(
      hh.id,
      { typeSlug: 'electricity', name: 'Power', provider: 'Grid', payerMemberId: me.id },
      db,
    );
    const now = Date.parse('2026-10-14T00:00:00Z');
    createBill(
      hh.id,
      {
        serviceId: power.id,
        amountMinor: 12345,
        periodStart: '2026-09-01',
        periodEnd: '2026-09-30',
        dueDate: '2026-10-20',
        source: 'manual',
      },
      db,
    );
    requestAccess({ name: 'Pat', email: 'pat@example.com', message: null }, db);

    const o = overview(db, now);
    expect(o.households).toBe(1);
    expect(o.accounts).toBe(2);
    expect(o.openRequests).toBe(1);
    expect(o.earlyAccess).toBe(true);

    const rows = householdRows(dev.id, db, now);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      name: 'Counted House',
      people: 1,
      billsThisMonth: { count: 1, totalMinor: 12345, currency: 'AUD' },
      aiCap: null,
      addressOn: false,
      myMemberId: me.id,
    });
    expect(householdRows(other.id, db, now)[0]!.myMemberId).toBeNull();
  });

  it('caps AI reads per household: the install limit, none, or a number', () => {
    const hh = createHousehold(
      {
        name: 'Capped House',
        currency: 'AUD',
        locale: 'en-AU',
        timezone: 'Australia/Melbourne',
        fiscalYearStartMonth: 7,
        splitMode: 'shared',
      },
      db,
    );
    expect(aiAllowance(hh.id, db).limit).not.toBeNull();
    setAiCap(hh.id, 0, db);
    expect(aiAllowance(hh.id, db).limit).toBeNull();
    setAiCap(hh.id, 5, db);
    expect(aiAllowance(hh.id, db)).toMatchObject({ limit: 5, left: 5 });
    setAiCap(hh.id, null, db);
    expect(aiAllowance(hh.id, db).limit).not.toBeNull();
  });

  it('gives the developers’ own households no cap, once', () => {
    expect(uncapDeveloperHouseholds(db)).toBe(1);
    expect(uncapDeveloperHouseholds(db)).toBe(0);
  });

  it('measures the data directory', () => {
    const s = storage(dir);
    expect(s.databaseBytes).toBeGreaterThan(0);
    expect(s.filesBytes).toBe(0);
  });
});
