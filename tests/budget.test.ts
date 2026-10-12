import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { openDb, type Db } from '@/db/client';
import { runMigrations } from '@/db/migrate';
import { createBill, setBillPaidToProvider } from '@/lib/bills';
import { budgetView, budgetYear, setBudget } from '@/lib/budget';
import { expectedBills } from '@/lib/expected';
import { createHousehold } from '@/lib/households';
import { createMember } from '@/lib/members';
import { createService } from '@/lib/services';

/** The Budget page (SCOPE-redesign-2.md §5): the year's projection and the yearly budget. */
let dir: string;
let db: Db;
let close: () => void;

beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hud-budget-'));
  runMigrations(dir);
  const opened = openDb(dir);
  db = opened.db;
  close = () => opened.sqlite.close();
});

afterAll(() => {
  close();
  fs.rmSync(dir, { recursive: true, force: true });
});

const TODAY = '2026-10-07';

describe('budgetYear', () => {
  it('is the financial year from 1 July, or the calendar year when it starts in January', () => {
    expect(budgetYear({ fiscalYearStartMonth: 7 }, TODAY)).toMatchObject({
      key: 'fy-2026',
      startYear: 2026,
      start: '2026-07-01',
      end: '2027-06-30',
    });
    expect(budgetYear({ fiscalYearStartMonth: 7 }, '2026-03-02').key).toBe('fy-2025');
    expect(budgetYear({ fiscalYearStartMonth: 1 }, TODAY)).toMatchObject({
      key: 'cy-2026',
      start: '2026-01-01',
      end: '2026-12-31',
    });
  });
});

describe('budgetView', () => {
  it('adds up what is paid, in and expected for the year, by due date, and keeps the yearly budget', () => {
    const hh = createHousehold(
      {
        name: 'Budget House',
        currency: 'AUD',
        locale: 'en-AU',
        timezone: 'Australia/Melbourne',
        fiscalYearStartMonth: 7,
        splitMode: 'single',
      },
      db,
    );
    const lisa = createMember(hh.id, { name: 'Lisa', role: 'owner', activeFrom: '2025-01-01' }, db);
    // Electricity, priced by use: a paid September bill and an unpaid October one.
    const power = createService(
      hh.id,
      { typeSlug: 'electricity', name: 'Electricity', provider: 'Lumo', cadence: 'monthly' },
      db,
    );
    const sep = createBill(
      hh.id,
      {
        serviceId: power.id,
        amountMinor: 54294,
        periodStart: '2026-08-07',
        periodEnd: '2026-09-06',
        dueDate: '2026-09-21',
        source: 'manual',
      },
      db,
    );
    setBillPaidToProvider(hh.id, sep.id, true, db);
    createBill(
      hh.id,
      {
        serviceId: power.id,
        amountMinor: 6277,
        periodStart: '2026-09-07',
        periodEnd: '2026-10-06',
        dueDate: '2026-10-28',
        source: 'manual',
      },
      db,
    );
    // A yearly bill added by hand: $825 of rego each February.
    const rego = createService(
      hh.id,
      {
        typeSlug: 'vehicle_registration',
        name: 'Car rego',
        provider: 'Car rego',
        cadence: 'annual',
        recurring: false,
        expectedAmountMinor: 82500,
        expectedOn: '2027-02-15',
      },
      db,
    );
    expect(expectedBills(rego, [], '2028-03')).toEqual([
      expect.objectContaining({ dueDate: '2027-02-15', amountMinor: 82500, basis: 'added' }),
      expect.objectContaining({ dueDate: '2028-02-15', amountMinor: 82500, basis: 'added' }),
    ]);

    const v = budgetView(hh, lisa, TODAY, db);
    expect(v.yearKey).toBe('fy-2026');
    expect(v.months.map((m) => m.month)).toEqual([
      '2026-07',
      '2026-08',
      '2026-09',
      '2026-10',
      '2026-11',
      '2026-12',
      '2027-01',
      '2027-02',
      '2027-03',
      '2027-04',
      '2027-05',
      '2027-06',
    ]);
    expect(v.paidMinor).toBe(54294);
    expect(v.paidBills).toBe(1);
    expect(v.toPayMinor).toBe(6277);
    // The rego in February, and electricity's months ahead, are expected; nothing twice in October.
    const feb = v.months.find((m) => m.month === '2027-02')!;
    expect(feb.expectedMinor).toBeGreaterThanOrEqual(82500);
    expect(feb.biggest).toMatchObject({ serviceName: 'Car rego', amountMinor: 82500 });
    const oct = v.months.find((m) => m.month === '2026-10')!;
    expect(oct.toPayMinor).toBe(6277);
    expect(oct.expectedMinor).toBe(0);
    expect(v.projectedMinor).toBe(v.paidMinor + v.toPayMinor + v.expectedMinor);
    expect(v.setAsideMinor).toBe(Math.round(v.projectedMinor / 12));
    // Essentials (electricity) against the rest (rego).
    expect(v.split.essentialsMinor + v.split.otherMinor).toBe(v.projectedMinor);
    expect(v.split.otherMinor).toBeGreaterThanOrEqual(82500);
    // What the projection rests on: two months of bills and one yearly bill.
    expect(v.basisInfo).toMatchObject({
      monthsOfBills: 2,
      firstMonth: '2026-09',
      lastMonth: '2026-10',
      yearlyBills: 1,
      probablyLow: false,
      fullHistory: false,
    });
    // The big bills ahead come in date order and February leads.
    expect(v.bigAhead.map((m) => m.month)).toContain('2027-02');
    expect([...v.bigAhead].sort((a, b) => a.month.localeCompare(b.month))).toEqual(v.bigAhead);

    // No budget until one is set; then the verdict can be worked out from it.
    expect(v.budgetMinor).toBeNull();
    setBudget(hh.id, v.yearKey, 3_800_000, db);
    expect(budgetView(hh, lisa, TODAY, db).budgetMinor).toBe(3_800_000);
    setBudget(hh.id, v.yearKey, null, db);
    expect(budgetView(hh, lisa, TODAY, db).budgetMinor).toBeNull();
  });

  it('says the total is probably low when nothing is known about yearly bills', () => {
    const hh = createHousehold(
      {
        name: 'New House',
        currency: 'AUD',
        locale: 'en-AU',
        timezone: 'Australia/Melbourne',
        fiscalYearStartMonth: 7,
        splitMode: 'single',
      },
      db,
    );
    const me = createMember(hh.id, { name: 'Sam', role: 'owner', activeFrom: '2026-09-01' }, db);
    const v = budgetView(hh, me, TODAY, db);
    expect(v.projectedMinor).toBe(0);
    expect(v.basisInfo.probablyLow).toBe(true);
    expect(v.basisInfo.monthsOfBills).toBe(0);
    expect(v.bigAhead).toEqual([]);
  });
});
