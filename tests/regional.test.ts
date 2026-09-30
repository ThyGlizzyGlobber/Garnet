import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { openDb, type Db } from '@/db/client';
import { regionalStat } from '@/db/schema';
import { runMigrations } from '@/db/migrate';
import { createBill } from '@/lib/bills';
import { createHousehold, getHousehold } from '@/lib/households';
import { setHouseholdLocation } from '@/lib/location';
import { createMember } from '@/lib/members';
import { projectMonth } from '@/lib/projections';
import {
  areaComparison,
  computeRegionalStats,
  latestRegionalChoice,
  setRegionalSharing,
  sizeBand,
} from '@/lib/regional';
import { createService } from '@/lib/services';

let dir: string;
let db: Db;
let close: () => void;

beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hud-regional-'));
  runMigrations(dir);
  const opened = openDb(dir);
  db = opened.db;
  close = () => opened.sqlite.close();
});

afterAll(() => {
  close();
  fs.rmSync(dir, { recursive: true, force: true });
});

const TODAY = '2026-07-10';
const NOW = new Date(`${TODAY}T00:00:00Z`);
let n = 0;

/** A household in a postcode, with `people` members and monthly electricity at `perDay` cents. */
function home(postcode: string, people: number, perDay: number, opts: { demo?: boolean } = {}) {
  const hh = createHousehold(
    {
      name: `Home ${++n}`,
      currency: 'AUD',
      locale: 'en-AU',
      timezone: 'Australia/Melbourne',
      fiscalYearStartMonth: 7,
      splitMode: 'shared',
      isDemo: opts.demo,
    },
    db,
  );
  setHouseholdLocation(hh.id, { country: 'AU', postalCode: postcode }, db);
  const members = Array.from({ length: people }, (_, i) =>
    createMember(
      hh.id,
      { name: `P${i}`, role: i ? 'member' : 'owner', activeFrom: '2025-01-01' },
      db,
    ),
  );
  const svc = createService(
    hh.id,
    {
      typeSlug: 'electricity',
      name: 'Electricity',
      provider: 'Red Energy',
      usageUnit: 'kWh',
      payerMemberId: members[0]!.id,
    },
    db,
  );
  for (const m of ['2026-04', '2026-05', '2026-06']) {
    const days = m === '2026-06' || m === '2026-04' ? 30 : 31;
    createBill(
      hh.id,
      {
        serviceId: svc.id,
        amountMinor: perDay * days,
        usageQuantity: (perDay / 30) * days,
        usageUnit: 'kWh',
        periodStart: `${m}-01`,
        periodEnd: `${m}-${days}`,
        dueDate: `${m}-${days}`,
        source: 'manual',
      },
      db,
    );
  }
  return { hh, svc };
}

describe('sharing choices', () => {
  it('are on by default, and every change is recorded', () => {
    const { hh } = home('3550', 2, 300);
    expect(getHousehold(hh.id, db)!.shareRegional).toBe(true);
    expect(latestRegionalChoice(hh.id, db)).toBeNull(); // never shown the notice yet
    setRegionalSharing(hh.id, false, 'settings', null, db);
    expect(getHousehold(hh.id, db)!.shareRegional).toBe(false);
    expect(latestRegionalChoice(hh.id, db)).toMatchObject({ granted: false, how: 'settings' });
    setRegionalSharing(hh.id, true, 'settings', null, db);
    expect(latestRegionalChoice(hh.id, db)?.granted).toBe(true);
  });

  it('band household sizes', () => {
    expect([1, 2, 3, 4, 5, 8].map(sizeBand)).toEqual(['1', '2', '3-4', '3-4', '5+', '5+']);
  });
});

describe('area figures', () => {
  let bendigo: ReturnType<typeof home>[];
  let nextDoor: ReturnType<typeof home>[];
  let optedOut: ReturnType<typeof home>;

  beforeAll(() => {
    // 12 sharing households in 3550 (one from the first test too), 2 in 3551 (a
    // different region: Mount Alexander), 1 opted out, 1 demo.
    bendigo = Array.from({ length: 11 }, (_, i) => home('3550', i < 6 ? 2 : 4, 300 + i * 20));
    nextDoor = [home('3551', 2, 500), home('3551', 2, 520)];
    optedOut = home('3550', 2, 9999);
    setRegionalSharing(optedOut.hh.id, false, 'settings', null, db);
    home('3550', 2, 7777, { demo: true });
  });

  it('pool only sharing households, only where at least 10 stand behind a figure', () => {
    const r = computeRegionalStats(db, NOW);
    expect(r.households).toBe(14); // 12 in 3550 + 2 in 3551
    const rows = db.select().from(regionalStat).all();
    const find = (level: string, area: string, band = 'all', metric = 'cost_per_day') =>
      rows.find(
        (x) =>
          x.level === level &&
          x.area === area &&
          x.month === '2026-05' &&
          x.sizeBand === band &&
          x.metric === metric,
      );
    expect(find('postcode', 'AU:3550')).toMatchObject({ households: 12, unit: 'AUD' });
    expect(find('postcode', 'AU:3551')).toBeUndefined(); // only 2 households
    expect(find('region', 'AU:VIC:Greater Bendigo')?.households).toBe(12);
    expect(find('region', 'AU:VIC:Mount Alexander')).toBeUndefined(); // 2 households
    expect(find('state', 'AU:VIC')?.households).toBe(14);
    expect(find('postcode', 'AU:3550', '2')).toBeUndefined(); // 7 two-person homes: too few
    expect(find('postcode', 'AU:3550', 'all', 'usage_per_day')?.unit).toBe('kWh');
    expect(find('postcode', 'AU:3550', 'all', 'rate')?.unit).toBe('AUD/kWh');
    // The opted-out and demo households never count (their huge bills would show).
    expect(
      Math.max(...rows.filter((x) => x.metric === 'cost_per_day').map((x) => x.p75)),
    ).toBeLessThan(7000);
    // Nothing in the pooled table points at a household.
    expect(Object.keys(rows[0]!)).not.toContain('householdId');
  });

  it('compare a household with the finest area that has a figure', () => {
    computeRegionalStats(db, NOW);
    const mine = areaComparison(nextDoor[0]!.hh.id, nextDoor[0]!.svc.id, TODAY, db)!;
    expect(mine).toMatchObject({
      month: '2026-06',
      level: 'state',
      areaName: 'Victoria',
      sameSize: false,
    });
    expect(mine.cost!.you).toBeCloseTo(500, 5);
    expect(mine.cost!.median).toBeGreaterThan(300);
    expect(mine.rate!.you).toBeCloseTo(5 / (500 / 30), 5);
    const inTown = areaComparison(bendigo[0]!.hh.id, bendigo[0]!.svc.id, TODAY, db)!;
    expect(inTown.level).toBe('postcode');
    expect(inTown.areaName).toBe('3550');
  });

  it('show nothing to a household that doesn’t share, and drop it from the pool at once', () => {
    computeRegionalStats(db, NOW);
    expect(areaComparison(optedOut.hh.id, optedOut.svc.id, TODAY, db)).toBeNull();
    // Bendigo homes stop sharing: 3550 has 12, then 10 (still enough), then 9.
    for (const h of bendigo.slice(0, 2)) setRegionalSharing(h.hh.id, false, 'settings', null, db);
    computeRegionalStats(db, NOW);
    const third = bendigo[2]!;
    expect(areaComparison(third.hh.id, third.svc.id, TODAY, db)?.level).toBe('postcode');
    setRegionalSharing(bendigo[3]!.hh.id, false, 'settings', null, db);
    computeRegionalStats(db, NOW);
    // 9 left in 3550 and in Greater Bendigo: widened to Victoria (11).
    expect(areaComparison(third.hh.id, third.svc.id, TODAY, db)?.level).toBe('state');
    for (const h of bendigo.slice(0, 4)) setRegionalSharing(h.hh.id, true, 'settings', null, db);
  });

  it('price a new household’s next bill when it has little history of its own', () => {
    computeRegionalStats(db, NOW);
    const hh = createHousehold(
      {
        name: 'Just moved in',
        currency: 'AUD',
        locale: 'en-AU',
        timezone: 'Australia/Melbourne',
        fiscalYearStartMonth: 7,
        splitMode: 'shared',
      },
      db,
    );
    setHouseholdLocation(hh.id, { country: 'AU', postalCode: '3550' }, db);
    const jo = createMember(hh.id, { name: 'Jo', role: 'owner', activeFrom: '2026-01-01' }, db);
    const svc = createService(
      hh.id,
      { typeSlug: 'electricity', name: 'Electricity', provider: 'AGL', payerMemberId: jo.id },
      db,
    );
    // Its first bill, for April (due in May): June's bill for May is expected
    // at the area's typical cost, not April's.
    createBill(
      hh.id,
      {
        serviceId: svc.id,
        amountMinor: 3000,
        periodStart: '2026-04-01',
        periodEnd: '2026-04-30',
        dueDate: '2026-05-14',
        source: 'manual',
      },
      db,
    );
    const june = projectMonth(hh.id, '2026-06', db, '2026-05-20').services.find(
      (s) => s.service.id === svc.id,
    )!;
    expect(june.method).toBe('area');
    expect(june.monthMinor / 31).toBeGreaterThan(300);
    // Not sharing: no area figure, so its own bill's cost per day.
    setRegionalSharing(hh.id, false, 'settings', null, db);
    expect(
      projectMonth(hh.id, '2026-06', db, '2026-05-20').services.find(
        (s) => s.service.id === svc.id,
      )!.method,
    ).toBe('single');
  });
});
