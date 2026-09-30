import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { openDb, type Db } from '@/db/client';
import { runMigrations } from '@/db/migrate';
import type { Household } from '@/db/schema';
import { createBill } from '@/lib/bills';
import { addDays } from '@/lib/dates';
import { createHousehold, getHousehold } from '@/lib/households';
import { createMember } from '@/lib/members';
import { serviceOverview } from '@/lib/service-overview';
import { createService, getService } from '@/lib/services';

let dir: string;
let db: Db;
let close: () => void;
let hh: Household;
let internetId: string;
let gasId: string;

/** The same day next month, e.g. 14 Dec → 14 Jan. */
const nextMonthDay = (d: string) => {
  const [y, m] = d.split('-').map(Number) as [number, number];
  return `${m === 12 ? y + 1 : y}-${String(m === 12 ? 1 : m + 1).padStart(2, '0')}-${d.slice(8)}`;
};

beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hud-overview-'));
  runMigrations(dir);
  const opened = openDb(dir);
  db = opened.db;
  close = () => opened.sqlite.close();
  hh = getHousehold(
    createHousehold(
      {
        name: 'Smith Household',
        currency: 'AUD',
        locale: 'en-AU',
        timezone: 'Australia/Melbourne',
        fiscalYearStartMonth: 7,
        splitMode: 'single',
      },
      db,
    ).id,
    db,
  )!;
  const me = createMember(
    hh.id,
    { name: 'Lisa', pinHash: 'x', role: 'owner', activeFrom: '2025-01-01' },
    db,
  );
  // Internet at $129 a month from 14 December, like the owner's.
  internetId = createService(
    hh.id,
    {
      typeSlug: 'internet',
      name: 'Internet',
      provider: 'Aussie Broadband',
      cadence: 'monthly',
      payerMemberId: me.id,
    },
    db,
  ).id;
  let start = '2025-12-14';
  for (let i = 0; i < 7; i++) {
    const next = nextMonthDay(start);
    createBill(
      hh.id,
      {
        serviceId: internetId,
        amountMinor: 12900,
        periodStart: start,
        periodEnd: addDays(next, -1),
        issueDate: start,
        dueDate: start,
        source: 'manual',
      },
      db,
    );
    start = next;
  }
  // Gas that varies, from 1 January.
  gasId = createService(
    hh.id,
    { typeSlug: 'gas', name: 'Gas', provider: 'Hearthline', cadence: 'monthly' },
    db,
  ).id;
  for (const [s, e, amount] of [
    ['2026-01-01', '2026-01-31', 6200],
    ['2026-02-01', '2026-02-28', 5600],
    ['2026-03-01', '2026-03-31', 9300],
  ] as const)
    createBill(
      hh.id,
      {
        serviceId: gasId,
        amountMinor: amount,
        periodStart: s,
        periodEnd: e,
        dueDate: e,
        source: 'manual',
      },
      db,
    );
});

afterAll(() => {
  close();
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('a fixed-price service', () => {
  it('averages, guesses and estimates at its price, whatever the month’s length', () => {
    const o = serviceOverview(hh, getService(hh.id, internetId, db)!, '2026-08-20', db);
    // Each bill is its price, exactly: $129 a month.
    expect(o.stats.each).toMatchObject({ amountMinor: 12900, cadence: 'monthly', exact: true });
    expect(o.stats.next).toMatchObject({ amountMinor: 12900, method: 'fixed' });
    // Each month ahead: the bills due in it, in full. The latest bill is June's,
    // so July's and August's haven't come in: both are still to come this month.
    expect(o.comingUp.map((c) => c.minor)).toEqual([25800, 12900, 12900]);
    expect(o.comingUp.every((c) => c.method === 'fixed' || c.method === 'known')).toBe(true);
    // One bar per bill at its cost, so every bar is the same height.
    expect(o.barsPerBill).toBe(true);
    expect(new Set(o.bars.map((b) => b.value))).toEqual(new Set([12900]));
  });
});

describe('a service whose bills vary', () => {
  it('says what a bill costs when it comes: the average of its bills', () => {
    const o = serviceOverview(hh, getService(hh.id, gasId, db)!, '2026-04-10', db);
    // $211 over three monthly bills this financial year so far: about $70.33 each.
    expect(o.stats.year.minor).toBe(21100);
    expect(o.stats.each).toMatchObject({ amountMinor: 7033, cadence: 'monthly', exact: false });
    expect(o.stats.next?.method).not.toBe('fixed');
  });

  it('takes a new price as the price, and keeps last year at last year’s', () => {
    // Internet went from $129 to $139 in July: the next bill is $139.
    const svc = getService(hh.id, internetId, db)!;
    createBill(
      hh.id,
      {
        serviceId: svc.id,
        amountMinor: 13900,
        periodStart: '2026-07-14',
        periodEnd: '2026-08-13',
        issueDate: '2026-07-14',
        dueDate: '2026-07-14',
        source: 'manual',
      },
      db,
    );
    const o = serviceOverview(hh, svc, '2026-08-20', db);
    expect(o.stats.each?.amountMinor).toBe(13900);
    expect(o.stats.next?.amountMinor).toBe(13900);
    expect(o.stats.year.label).toBe('2025–26');
  });
});
