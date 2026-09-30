import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { openDb, type Db } from '@/db/client';
import { runMigrations } from '@/db/migrate';
import { createBill } from '@/lib/bills';
import { createHousehold } from '@/lib/households';
import { createMember } from '@/lib/members';
import { fixedPrice } from '@/lib/cadence';
import { eachBill, expectedBills, nextExpected } from '@/lib/expected';
import { projectMonth } from '@/lib/projections';
import { remindersFor, summariseReminders } from '@/lib/reminders';
import { createService } from '@/lib/services';

const m = (amt: number, start: string, end: string, due = end) => ({
  amountMinor: amt,
  periodStart: start,
  periodEnd: end,
  dueDate: due,
});
type Cadence = 'monthly' | 'quarterly' | 'annual' | 'irregular';
const svc = (cadence: Cadence, byUse = false) => ({
  id: 's',
  isActive: true,
  cancelledAt: null,
  cadence,
  usageUnit: byUse ? 'kWh' : null,
  seasonal: byUse,
  recurringSince: null,
});

describe('expected bills', () => {
  it('are a fixed price exactly, every month, whatever its length', () => {
    const flat = [
      m(12900, '2026-06-14', '2026-07-13', '2026-06-14'),
      m(12900, '2026-07-14', '2026-08-13', '2026-07-14'),
      m(12900, '2026-08-14', '2026-09-13', '2026-08-14'),
    ];
    expect(fixedPrice(flat)).toBe(12900);
    const next = expectedBills(svc('monthly'), flat, '2027-01');
    expect(next.map((e) => [e.dueDate, e.amountMinor, e.basis])).toEqual([
      ['2026-09-14', 12900, 'fixed'],
      ['2026-10-14', 12900, 'fixed'],
      ['2026-11-14', 12900, 'fixed'],
      ['2026-12-14', 12900, 'fixed'],
      ['2027-01-14', 12900, 'fixed'],
    ]);
    // A price rise: no longer fixed. One bill isn't a pattern.
    expect(fixedPrice([...flat.slice(0, 2), m(13900, '2026-08-14', '2026-09-13')])).toBeNull();
    expect(fixedPrice(flat.slice(0, 1))).toBeNull();
  });

  it('follow last year for bills priced by use, moved by recent bills', () => {
    const bills = [
      m(30000, '2025-04-01', '2025-06-30'),
      m(60000, '2025-07-01', '2025-09-30'), // winter
      m(30000, '2025-10-01', '2025-12-31'),
      m(33000, '2026-01-01', '2026-03-31'),
      m(33000, '2026-04-01', '2026-06-30'),
    ];
    const [winter] = expectedBills(svc('quarterly', true), bills, '2026-09');
    expect(winter?.basis).toBe('lastYear');
    expect(winter?.periodStart).toBe('2026-07-01');
    // Last winter's $600, moved up by the recent bills (≈ 10% dearer).
    expect(winter!.amountMinor).toBeGreaterThan(60000);
    expect(winter!.amountMinor).toBeLessThan(70000);
  });

  it('use the recent cost per day, times its days, without last year', () => {
    const bills = [m(9000, '2026-06-01', '2026-06-30'), m(9300, '2026-07-01', '2026-07-31')];
    const [next] = expectedBills(svc('monthly', true), bills, '2026-08');
    expect(next?.basis).toBe('recent');
    expect(next?.amountMinor).toBe(Math.round(((9000 / 30 + 9300 / 31) / 2) * 31));
  });

  it('keep a yearly bill whole, at its latest price, a year on', () => {
    const rego = [m(80000, '2025-03-01', '2026-02-28'), m(82500, '2026-03-01', '2027-02-28')];
    const next = expectedBills(svc('annual'), rego, '2028-12');
    expect(next.map((e) => [e.dueDate.slice(0, 7), e.amountMinor, e.basis])).toEqual([
      ['2028-02', 82500, 'latest'],
    ]);
  });

  it('price a car service as one payment, never per day (the $267,421 BMW)', () => {
    const visits = [m(73300, '2025-07-14', '2025-07-14'), m(73300, '2026-07-14', '2026-07-14')];
    const [next] = expectedBills(svc('annual'), visits, '2027-12');
    expect(next).toMatchObject({ dueDate: '2027-07-14', amountMinor: 73300 });
    // Irregular servicing has no date to expect.
    expect(nextExpected(svc('irregular'), visits)).toBeNull();
    const varying = [
      m(40000, '2025-01-10', '2025-01-10'),
      m(90000, '2025-07-10', '2025-07-10'),
      m(50000, '2026-01-10', '2026-01-10'),
    ];
    expect(nextExpected(svc('irregular'), varying)).toBeNull();
    expect(eachBill(svc('irregular'), varying, '2026-10-01')).toMatchObject({
      amountMinor: 60000,
      cadence: 'irregular',
      exact: false,
      everyMonths: 6,
    });
  });

  it('say what a bill costs when it comes, never spread over the months', () => {
    const rego = [m(80000, '2025-03-01', '2026-02-28'), m(82500, '2026-03-01', '2027-02-28')];
    expect(eachBill(svc('annual'), rego, '2026-10-01')).toMatchObject({
      amountMinor: 82500,
      cadence: 'annual',
    });
    const net = [m(12900, '2026-08-01', '2026-08-31'), m(12900, '2026-09-01', '2026-09-30')];
    expect(eachBill(svc('monthly'), net, '2026-10-01')).toMatchObject({
      amountMinor: 12900,
      exact: true,
    });
    expect(eachBill(svc('monthly'), [], '2026-10-01')).toBeNull();
  });
});

describe('projectMonth + reminders', () => {
  let dir: string;
  let db: Db;
  let hid: string;
  let close: () => void;
  let a: string;
  let b: string;
  beforeAll(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hud-proj-'));
    runMigrations(dir);
    const o = openDb(dir);
    db = o.db;
    close = () => o.sqlite.close();
    hid = createHousehold(
      {
        name: 'H',
        currency: 'AUD',
        locale: 'en-AU',
        timezone: 'Australia/Melbourne',
        fiscalYearStartMonth: 7,
        splitMode: 'shared',
      },
      db,
    ).id;
    a = createMember(
      hid,
      { name: 'A', pinHash: 'x', role: 'owner', activeFrom: '2025-01-01' },
      db,
    ).id;
    b = createMember(hid, { name: 'B', pinHash: 'x', activeFrom: '2025-01-01' }, db).id;
    const net = createService(
      hid,
      {
        typeSlug: 'internet',
        name: 'Internet',
        provider: 'P',
        cadence: 'monthly',
        payerMemberId: a,
      },
      db,
    ).id;
    for (const [s, e, due] of [
      ['2026-07-01', '2026-07-31', '2026-07-15'],
      ['2026-08-01', '2026-08-31', '2026-08-15'],
      ['2026-09-01', '2026-09-30', '2026-09-15'],
    ]) {
      createBill(
        hid,
        {
          serviceId: net,
          amountMinor: 3100,
          periodStart: s!,
          periodEnd: e!,
          dueDate: due!,
          source: 'manual',
          externalRef: s,
        },
        db,
      );
    }
  });
  afterAll(() => {
    close();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('projects October and splits the set-aside between members', () => {
    const p = projectMonth(hid, '2026-10', db, '2026-09-20');
    expect(p.services).toHaveLength(1);
    // The same $31 every month: October is $31 too, not 31 days at a
    // 30-day month's daily rate.
    expect(p.services[0]?.method).toBe('fixed');
    expect(p.totalMinor).toBe(3100);
    expect(p.services[0]?.expected.map((e) => e.dueDate)).toEqual(['2026-10-15']);
    expect(p.setAside.map((s) => s.minor).sort()).toEqual([1550, 1550]);
    expect(p.setAsideEach).toBe(1550);
    expect(projectMonth(hid, '2026-10', db, '2026-09-20').totalMinor).toBe(3100);
  });

  it('counts a month gone by as the bills that were due in it, nothing expected', () => {
    const p = projectMonth(hid, '2026-09', db, '2026-10-20');
    expect(p.totalMinor).toBe(3100);
    expect(p.services[0]?.method).toBe('known');
  });

  it('ranks reminders by urgency', () => {
    const rs = remindersFor(hid, b, '2026-09-10', 7, db);
    expect(rs.map((r) => r.level)).toEqual(['overdue', 'overdue', 'due_soon']);
    const sum = summariseReminders(rs);
    expect(sum.overdueCount).toBe(2);
    expect(sum.soonCount).toBe(1);
    expect(sum.overdueMinor).toBe(3100);
  });
});
