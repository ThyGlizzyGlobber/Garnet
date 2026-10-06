import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { openDb, type Db } from '@/db/client';
import { runMigrations } from '@/db/migrate';
import { createBill, setBillPaidToProvider } from '@/lib/bills';
import { createHousehold } from '@/lib/households';
import { createMember } from '@/lib/members';
import { createService } from '@/lib/services';
import { defaultPeriods, servicesPage } from '@/lib/services-view';

/** The Services page's analytics tool and tiles (SCOPE-services.md). */
let dir: string;
let db: Db;
let close: () => void;

beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hud-services-view-'));
  runMigrations(dir);
  const opened = openDb(dir);
  db = opened.db;
  close = () => opened.sqlite.close();
});

afterAll(() => {
  close();
  fs.rmSync(dir, { recursive: true, force: true });
});

const TODAY = '2026-09-29';

describe('servicesPage', () => {
  const hh = () =>
    createHousehold(
      {
        name: 'Lenses',
        currency: 'AUD',
        locale: 'en-AU',
        timezone: 'Australia/Melbourne',
        fiscalYearStartMonth: 7,
        splitMode: 'shared',
      },
      db,
    );

  it('opens on today’s month, year and financial year', () => {
    expect(defaultPeriods(TODAY, 7)).toEqual({ month: '2026-09', year: '2026', fy: '2026' });
    expect(defaultPeriods('2026-03-02', 7)).toEqual({ month: '2026-03', year: '2026', fy: '2025' });
    expect(defaultPeriods('2026-03-02', 1).fy).toBe('2026');
  });

  it('sums each lens by due date, compares with the period before to the same point, and bars the months', () => {
    const h = hh();
    const kim = createMember(h.id, { name: 'Kim', role: 'owner', activeFrom: '2025-01-01' }, db);
    const jo = createMember(h.id, { name: 'Jo', activeFrom: '2025-01-01' }, db);
    const rent = createService(
      h.id,
      {
        typeSlug: 'rent',
        name: 'Rent',
        provider: 'Harbour Lane',
        cadence: 'monthly',
        payerMemberId: kim.id,
      },
      db,
    );
    const power = createService(
      h.id,
      {
        typeSlug: 'electricity',
        name: 'Electricity',
        provider: 'Northwind',
        cadence: 'quarterly',
        payerMemberId: kim.id,
      },
      db,
    );
    // Rent every month at $1,000 since July 2025; power $300 a quarter.
    const bill = (serviceId: string, due: string, amountMinor: number, start = due) =>
      createBill(
        h.id,
        {
          serviceId,
          amountMinor,
          periodStart: start,
          periodEnd: due,
          dueDate: due,
          source: 'manual',
        },
        db,
      );
    const months = [];
    for (let i = 0; i < 16; i++) {
      const d = new Date(Date.UTC(2025, 6 + i, 1)).toISOString().slice(0, 10);
      months.push(d);
      bill(rent.id, d, 100_000);
    }
    bill(power.id, '2025-09-15', 30_000, '2025-06-15');
    const powerBillId = bill(power.id, '2026-09-15', 36_000, '2026-06-15').id;
    const page = servicesPage(h, kim, TODAY, 'month', undefined, db);
    // September: rent and the power bill.
    expect(page.figures.month).toMatchObject({
      period: '2026-09',
      totalMinor: 136_000,
      bills: 2,
      change: { dir: 'up' },
      prev: '2026-08',
      next: '2026-10',
    });
    expect(page.figures.month.bars).toHaveLength(12);
    expect(page.figures.month.bars.at(-1)).toMatchObject({
      month: '2026-09',
      lit: true,
      minor: 136_000,
    });
    expect(page.figures.month.facts).toMatchObject({ lens: 'month', toPayBills: 2, paidBills: 0 });
    // 2026 so far: nine months of rent plus the power bill; 2025 to September was three months plus a $300 bill.
    expect(page.figures.year).toMatchObject({ period: '2026', totalMinor: 936_000 });
    expect(page.figures.year.facts).toMatchObject({
      lens: 'year',
      aMonthMinor: 104_000,
      highest: { month: '2026-09', minor: 136_000 },
      lastYearMinor: 630_000,
    });
    expect(page.figures.year.change?.dir).toBe('up');
    expect(page.figures.year.bars.filter((b) => b.future)).toHaveLength(3);
    expect(page.figures.year.bars[8]).toMatchObject({
      month: '2026-09',
      minor: 136_000,
      ghost: 130_000,
    });
    // The financial year from July 2026: three months so far, with last year hollow behind.
    expect(page.figures.fy).toMatchObject({
      period: '2026',
      label: '2026–27',
      totalMinor: 336_000,
      next: null,
      prev: '2025',
    });
    expect(page.figures.fy.facts).toMatchObject({ lens: 'fy', lastYearMinor: 1_230_000 });
    expect(page.figures.fy.bars[0]).toMatchObject({ month: '2026-07', ghost: 100_000 });

    // September's rent fell due on the 1st: overdue leads its tile.
    const tiles = page.sections.flatMap((s) => s.tiles);
    expect(tiles.find((t) => t.name === 'Rent')).toMatchObject({
      figureMinor: 100_000,
      chip: { kind: 'overdue' },
      ring: { kind: 'overdue', days: 28 },
      provider: 'Harbour Lane',
    });
    // October's rent is due in two days: Jo's share still to come leads, the price the same, Kim's share the fact.
    const oct = servicesPage(
      h,
      kim,
      TODAY,
      'month',
      { month: '2026-10', year: '2026', fy: '2026' },
      db,
    );
    expect(oct.sections.flatMap((s) => s.tiles).find((t) => t.name === 'Rent')).toMatchObject({
      chip: { kind: 'soon', days: 2 },
      ring: { kind: 'shares', paid: 0, total: 1 },
      line: { kind: 'samePrice', dueDate: '2026-10-01' },
      // Kim pays the provider, so her own share is already paid.
      fact: { kind: 'yourShare', paid: true },
    });
    expect(jo.id).toBeTruthy();
    // Paid: the ring becomes a tick.
    setBillPaidToProvider(h.id, power.id && powerBillId, true, db, '2026-09-20');
    const again = servicesPage(h, kim, TODAY, 'month', undefined, db);
    const powerTile = again.sections.flatMap((s) => s.tiles).find((t) => t.name === 'Electricity')!;
    expect(powerTile.chip.kind).toBe('paid');
    expect(powerTile.ring.kind).toBe('paid');

    // The year lens: each tile is the year so far, with a bar a month and the change on last year.
    const year = servicesPage(h, kim, TODAY, 'year', undefined, db);
    const rentYear = year.sections.flatMap((s) => s.tiles).find((t) => t.name === 'Rent')!;
    expect(rentYear).toMatchObject({
      figureMinor: 900_000,
      line: { kind: 'bills', count: 9 },
      fact: { kind: 'vsLastYear', what: 'cost' },
      // Nothing paid yet and September's fell due: overdue leads the year too.
      ring: { kind: 'overdue' },
      chip: { kind: 'overdue' },
    });
    expect(rentYear.bars).toHaveLength(12);
    expect(rentYear.bars?.slice(0, 9).every((m) => m === 100_000)).toBe(true);
    expect(year.sections[0]?.totalMinor).toBe(936_000);
  });
});
