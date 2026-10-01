import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { openDb, type Db } from '@/db/client';
import { runMigrations } from '@/db/migrate';
import { share } from '@/db/schema';
import { allowancePeriodBounds, allowanceView, hasAllowance } from '@/lib/allowance';
import { createBill } from '@/lib/bills';
import { createHousehold, getHousehold } from '@/lib/households';
import { createMember } from '@/lib/members';
import { createService, getService } from '@/lib/services';

let dir: string;
let db: Db;
let close: () => void;

beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hud-allowance-'));
  runMigrations(dir);
  const opened = openDb(dir);
  db = opened.db;
  close = () => opened.sqlite.close();
});

afterAll(() => {
  close();
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('allowance periods', () => {
  it('run by month, by quarter from the financial year, or by financial year', () => {
    expect(allowancePeriodBounds('2026-10-14', 'month', 7, 'en-AU')).toEqual({
      start: '2026-10-01',
      end: '2026-10-31',
      label: 'October 2026',
    });
    expect(allowancePeriodBounds('2026-10-14', 'quarter', 7, 'en-AU')).toMatchObject({
      start: '2026-10-01',
      end: '2026-12-31',
    });
    expect(allowancePeriodBounds('2026-08-02', 'quarter', 7, 'en-AU')).toMatchObject({
      start: '2026-07-01',
      end: '2026-09-30',
    });
    expect(allowancePeriodBounds('2026-10-14', 'year', 7, 'en-AU')).toMatchObject({
      start: '2026-07-01',
      end: '2027-06-30',
      label: '2026–27',
    });
  });
});

describe('a landlord’s utilities allowance (D17)', () => {
  it('counts the period’s bills against the cap, owes the overage to the tenants, and makes no shares', () => {
    const hh = createHousehold(
      {
        name: 'Let Flat',
        currency: 'AUD',
        locale: 'en-AU',
        timezone: 'Australia/Melbourne',
        fiscalYearStartMonth: 7,
        splitMode: 'shared',
        type: 'investment_property',
        allowanceMinor: 20000,
        allowancePeriod: 'month',
      },
      db,
    );
    expect(hasAllowance(hh)).toBe(true);
    const landlord = createMember(
      hh.id,
      { name: 'Landlord', role: 'owner', activeFrom: '2025-01-01' },
      db,
    );
    const priya = createMember(
      hh.id,
      { name: 'Priya', role: 'tenant', activeFrom: '2025-07-01' },
      db,
    );
    const tom = createMember(hh.id, { name: 'Tom', role: 'tenant', activeFrom: '2025-07-01' }, db);
    const power = createService(
      hh.id,
      { typeSlug: 'electricity', name: 'Power', provider: 'Grid', payerMemberId: landlord.id },
      db,
    );
    // A landlord is out of the split by default in a let property (D16)…
    expect(getService(hh.id, power.id, db)!.notSplitWith).toEqual([landlord.id]);
    const rates = createService(
      hh.id,
      {
        typeSlug: 'council_rates',
        name: 'Rates',
        provider: 'Council',
        ownerMemberId: landlord.id,
      },
      db,
    );
    const bill = (serviceId: string, amountMinor: number, dueDate: string) =>
      createBill(
        hh.id,
        {
          serviceId,
          amountMinor,
          periodStart: '2026-09-01',
          periodEnd: '2026-09-30',
          dueDate,
          source: 'manual',
        },
        db,
      );
    const b1 = bill(power.id, 15000, '2026-10-05');
    bill(power.id, 9000, '2026-10-20');
    bill(rates.id, 50000, '2026-10-10'); // the landlord's own: never counted
    bill(power.id, 8000, '2026-11-03'); // next period
    // …and under an allowance nothing is split at all.
    expect(db.select().from(share).where(eq(share.billId, b1.id)).all()).toEqual([]);

    const view = allowanceView(getHousehold(hh.id, db)!, '2026-10-14', db)!;
    expect(view.label).toBe('October 2026');
    expect(view.usedMinor).toBe(24000);
    expect(view.overMinor).toBe(4000);
    expect(view.leftMinor).toBe(0);
    expect(view.lines.map((l) => l.amountMinor)).toEqual([9000, 15000]);
    expect(view.owed).toEqual([
      { memberId: priya.id, name: 'Priya', colour: priya.colour, minor: 2000 },
      { memberId: tom.id, name: 'Tom', colour: tom.colour, minor: 2000 },
    ]);
    expect(view.history).toEqual([]);

    const november = allowanceView(getHousehold(hh.id, db)!, '2026-11-10', db)!;
    expect(november.usedMinor).toBe(8000);
    expect(november.leftMinor).toBe(12000);
    expect(november.owed.every((o) => o.minor === 0)).toBe(true);
    expect(november.history).toEqual([
      {
        start: '2026-10-01',
        end: '2026-10-31',
        label: 'October 2026',
        usedMinor: 24000,
        overMinor: 4000,
      },
    ]);
  });

  it('is off without a cap', () => {
    const hh = createHousehold(
      {
        name: 'Direct Flat',
        currency: 'AUD',
        locale: 'en-AU',
        timezone: 'Australia/Melbourne',
        fiscalYearStartMonth: 7,
        splitMode: 'shared',
        type: 'investment_property',
      },
      db,
    );
    expect(hasAllowance(hh)).toBe(false);
    expect(allowanceView(hh, '2026-10-14', db)).toBeNull();
  });
});
