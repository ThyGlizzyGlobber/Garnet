import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { openDb, type Db } from '@/db/client';
import { runMigrations } from '@/db/migrate';
import { createBill } from '@/lib/bills';
import { createHousehold, updateHousehold } from '@/lib/households';
import { createMember } from '@/lib/members';
import { createService } from '@/lib/services';
import { shellView } from '@/lib/shell';

/** The frame around every page: who's here, what each service costs this month, the viewer. */
let dir: string;
let db: Db;
let close: () => void;

beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hud-shell-'));
  runMigrations(dir);
  const opened = openDb(dir);
  db = opened.db;
  close = () => opened.sqlite.close();
});

afterAll(() => {
  close();
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('shellView', () => {
  it('lists the household, this month per service, the viewer’s own services and the viewer', () => {
    const hh = createHousehold(
      {
        name: 'Riverside House',
        currency: 'AUD',
        locale: 'en-AU',
        timezone: 'Australia/Melbourne',
        fiscalYearStartMonth: 7,
        splitMode: 'shared',
      },
      db,
    );
    const alex = createMember(hh.id, { name: 'Alex', role: 'owner', activeFrom: '2026-01-01' }, db);
    const jordan = createMember(hh.id, { name: 'Jordan', activeFrom: '2026-01-01' }, db);
    createMember(
      hh.id,
      { name: 'Moved out', activeFrom: '2026-01-01', activeTo: '2026-06-30' },
      db,
    );
    const power = createService(
      hh.id,
      { typeSlug: 'electricity', name: 'Electricity', provider: 'Origin', payerMemberId: alex.id },
      db,
    );
    const rego = createService(
      hh.id,
      {
        typeSlug: 'vehicle_registration',
        name: 'Car rego',
        provider: 'VicRoads',
        payerMemberId: jordan.id,
        ownerMemberId: jordan.id,
      },
      db,
    );
    // A quarterly bill due this month counts in full in it.
    createBill(
      hh.id,
      {
        serviceId: power.id,
        amountMinor: 92_000,
        periodStart: '2026-06-01',
        periodEnd: '2026-08-31',
        dueDate: '2026-09-25',
        source: 'manual',
      },
      db,
    );
    createBill(
      hh.id,
      {
        serviceId: rego.id,
        amountMinor: 91_250,
        periodStart: '2026-09-01',
        periodEnd: '2027-08-31',
        dueDate: '2026-09-20',
        source: 'manual',
      },
      db,
    );

    const v = shellView(hh, jordan, '2026-09-29', db);
    expect(v.household).toEqual({ name: 'Riverside House', members: ['Alex', 'Jordan'] });
    expect(v.split).toBe(true);
    expect(v.services.map((s) => [s.name, s.minor])).toEqual([['Electricity', 92_000]]);
    // An everyday bill: listed under Essentials.
    expect(v.services[0]!.kind === 'service' && v.services[0]!.essential).toBe(true);
    // Rego is under Vehicles, one line per kind of vehicle bill.
    const mine = v.mine[0]!;
    expect(mine.kind === 'group' && mine.category).toBe('vehicle');
    expect(mine.kind === 'group' && mine.children.map((c) => [c.name, c.minor])).toEqual([
      ['Vehicle registration', 91_250],
    ]);
    expect(mine.minor).toBe(91_250);
    expect(v.inboxCount).toBe(0);
    expect(v.me).toEqual({ name: 'Jordan', colour: jordan.colour, admin: false });

    // Alex doesn't see Jordan's rego; a household that doesn't split loses Money.
    expect(shellView(hh, alex, '2026-09-29', db).mine).toEqual([]);
    const single = updateHousehold(hh.id, { splitMode: 'single' }, db);
    expect(shellView(single, alex, '2026-09-29', db)).toMatchObject({
      split: false,
      me: { admin: true },
    });
  });
});
