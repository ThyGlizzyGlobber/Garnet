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
import { getNavLayout, saveNavChildren, saveNavLayout } from '@/lib/nav-store';
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
    expect(v.household).toEqual({
      name: 'Riverside House',
      members: ['Alex', 'Jordan'],
      type: null,
    });
    expect(v.split).toBe(true);
    // No groups yet: one list of the household's; Jordan's own rego under My Services' Vehicles.
    expect(v.sections).toHaveLength(1);
    expect(v.sections[0]!.group).toBeNull();
    expect(v.sections[0]!.entries.map((s) => [s.key.slice(0, 2), s.name, s.minor])).toEqual([
      ['s:', 'Electricity', 92_000],
    ]);
    expect(v.mine).toHaveLength(1);
    expect(v.mine[0]!.entries.map((s) => [s.key, s.minor])).toEqual([['mc:vehicle', 91_250]]);
    const vehicles = v.mine[0]!.entries[0]!;
    expect(vehicles.kind === 'group' && vehicles.category).toBe('vehicle');
    // One line per kind of vehicle bill, with what's due this month.
    expect(vehicles.kind === 'group' && vehicles.children.map((c) => [c.name, c.minor])).toEqual([
      ['Vehicle Registration', 91_250],
    ]);
    // What each line is (for naming groups), the household's and the viewer's own.
    expect(v.lines.map((l) => l.key)).toEqual([`s:${power.id}`, 'mc:vehicle']);
    expect(v.inboxCount).toBe(0);
    expect(v.me).toEqual({ name: 'Jordan', colour: jordan.colour, admin: false, role: 'member' });

    // Alex doesn't see Jordan's rego; a household that doesn't split loses Money.
    expect(
      shellView(hh, alex, '2026-09-29', db).sections.flatMap((x) => x.entries.map((e) => e.name)),
    ).toEqual(['Electricity']);
    const single = updateHousehold(hh.id, { splitMode: 'single' }, db);
    expect(shellView(single, alex, '2026-09-29', db)).toMatchObject({
      split: false,
      me: { admin: true },
    });
  });

  it('arranges the services in the viewer’s own groups and order', () => {
    const hh = createHousehold(
      {
        name: 'Arranged',
        currency: 'AUD',
        locale: 'en-AU',
        timezone: 'Australia/Melbourne',
        fiscalYearStartMonth: 7,
        splitMode: 'shared',
      },
      db,
    );
    const kim = createMember(hh.id, { name: 'Kim', role: 'owner', activeFrom: '2026-01-01' }, db);
    const svc = (typeSlug: string, name: string) =>
      createService(hh.id, { typeSlug, name, provider: name, payerMemberId: kim.id }, db);
    const water = svc('water', 'Water');
    const power = svc('electricity', 'Electricity');
    const gas = svc('gas', 'Gas');
    svc('gym', 'Gym');
    const names = () =>
      shellView(hh, kim, '2026-09-29', db).sections.map((x) => [
        x.group?.name ?? null,
        x.entries.map((e) => e.name || e.key),
      ]);
    // By default: the everyday bills first, in catalog order.
    expect(names()).toEqual([[null, ['Electricity', 'Gas', 'Water', 'c:lifestyle']]]);

    // Kim groups power and gas, unnamed (it takes the suggested name); the rest follow it.
    const { lines } = shellView(hh, kim, '2026-09-29', db);
    saveNavLayout(
      kim.id,
      {
        loose: ['c:lifestyle', `s:${water.id}`],
        groups: [{ id: 'g1', name: '', items: [`s:${gas.id}`, `s:${power.id}`] }],
        mine: [],
        mineGroups: [],
      },
      lines,
      db,
    );
    expect(names()).toEqual([
      ['Energy', ['Gas', 'Electricity']],
      [null, ['c:lifestyle', 'Water']],
    ]);
    // A service added later joins the ones in no group, after the groups.
    svc('internet', 'Internet');
    expect(names()[1]).toEqual([null, ['c:lifestyle', 'Water', 'Internet']]);

    // Inside a main service: Kim's order, kept when the groups are saved again.
    const yoga = svc('gym', 'Yoga');
    const gymId = shellView(hh, kim, '2026-09-29', db)
      .sections.flatMap((x) => x.entries)
      .find((e) => e.key === 'c:lifestyle');
    expect(gymId?.kind === 'group' && gymId.children.map((c) => c.name)).toEqual(['Gym', 'Yoga']);
    const gym = gymId?.kind === 'group' ? gymId.children[0]!.id : '';
    saveNavChildren(kim.id, 'c:lifestyle', [yoga.id, gym], db);
    saveNavLayout(kim.id, { ...getNavLayout(kim.id, db)!, groups: [] }, lines, db);
    const after = shellView(hh, kim, '2026-09-29', db)
      .sections.flatMap((x) => x.entries)
      .find((e) => e.key === 'c:lifestyle');
    expect(after?.kind === 'group' && after.children.map((c) => c.name)).toEqual(['Yoga', 'Gym']);
  });
});
