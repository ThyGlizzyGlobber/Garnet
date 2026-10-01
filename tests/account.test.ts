import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { openDb, type Db } from '@/db/client';
import { runMigrations } from '@/db/migrate';
import { accountView, householdsOf } from '@/lib/account';
import { signInAccount } from '@/lib/accounts';
import { createBill } from '@/lib/bills';
import { createHousehold } from '@/lib/households';
import { createMember, makePrimary } from '@/lib/members';
import { createService } from '@/lib/services';

let dir: string;
let db: Db;
let close: () => void;

beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hud-account-'));
  runMigrations(dir);
  const opened = openDb(dir);
  db = opened.db;
  close = () => opened.sqlite.close();
});

afterAll(() => {
  close();
  fs.rmSync(dir, { recursive: true, force: true });
});

const household = (name: string, splitMode: 'shared' | 'single' = 'shared') =>
  createHousehold(
    {
      name,
      currency: 'AUD',
      locale: 'en-AU',
      timezone: 'Australia/Melbourne',
      fiscalYearStartMonth: 7,
      splitMode,
    },
    db,
  );

describe('the Account Dashboard', () => {
  it('shows one tile per household, leading with what you owe there, the primary first', () => {
    const account = signInAccount({ email: 'tiles-test@example.com', name: 'Tiles' }, db);
    const share = household('Share House');
    const home = household('Own Home', 'single');
    const payer = createMember(share.id, { name: 'Payer', activeFrom: '2026-01-01' }, db);
    const me = createMember(
      share.id,
      { name: 'Me', activeFrom: '2026-01-01', accountId: account.id, isPrimary: true },
      db,
    );
    const meHome = createMember(
      home.id,
      { name: 'Me', activeFrom: '2026-01-01', accountId: account.id, role: 'owner' },
      db,
    );
    const power = createService(
      share.id,
      { typeSlug: 'electricity', name: 'Electricity', provider: 'X', payerMemberId: payer.id },
      db,
    );
    createBill(
      share.id,
      {
        serviceId: power.id,
        amountMinor: 20000,
        periodStart: '2026-07-01',
        periodEnd: '2026-09-30',
        dueDate: '2099-01-01',
        source: 'manual',
      },
      db,
    );
    expect(householdsOf(me, db).map((m) => m.householdId)).toEqual([share.id, home.id]);

    const view = accountView(account, me, db);
    expect(view.name).toBe('Tiles');
    expect(view.method).toBe('code');
    expect(view.tiles.map((t) => t.name)).toEqual(['Share House', 'Own Home']);
    const [shareTile, homeTile] = view.tiles;
    expect(shareTile).toMatchObject({ primary: true, current: true, admin: false, split: true });
    expect(shareTile!.oweMinor).toBe(10000);
    expect(shareTile!.people.map((p) => p.name).sort()).toEqual(['Me', 'Payer']);
    expect(homeTile).toMatchObject({ primary: false, current: false, admin: true, split: false });
    expect(homeTile!.oweMinor).toBe(0);
    expect(view.oweAll).toEqual({ minor: 10000, currency: 'AUD', locale: 'en-AU' });

    // Making the other one primary puts it first.
    makePrimary(account.id, meHome.id, db);
    expect(accountView(account, me, db).tiles.map((t) => t.name)).toEqual([
      'Own Home',
      'Share House',
    ]);
  });

  it('has no tiles for an account that hasn’t joined anything', () => {
    const account = signInAccount({ email: 'nobody@example.com' }, db);
    const view = accountView(account, null, db);
    expect(view.tiles).toEqual([]);
    expect(view.oweAll).toBeNull();
    expect(view.name).toBeNull();
  });
});
