import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { openDb, type Db } from '@/db/client';
import { runMigrations } from '@/db/migrate';
import { createBill, getBill, resplitBills, resplittableBills, setSharePaid } from '@/lib/bills';
import { createHousehold } from '@/lib/households';
import { createMember } from '@/lib/members';
import { projectMonth } from '@/lib/projections';
import { createService, getFixedAmounts, updateService } from '@/lib/services';
import { splitView } from '@/lib/split-view';

let dir: string;
let db: Db;
let close: () => void;

beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hud-service-splits-'));
  runMigrations(dir);
  const opened = openDb(dir);
  db = opened.db;
  close = () => opened.sqlite.close();
});

afterAll(() => {
  close();
  fs.rmSync(dir, { recursive: true, force: true });
});

let n = 0;
function setup() {
  const hh = createHousehold(
    {
      name: `Share house ${++n}`,
      currency: 'AUD',
      locale: 'en-AU',
      timezone: 'Australia/Melbourne',
      fiscalYearStartMonth: 7,
      splitMode: 'shared',
    },
    db,
  );
  const person = (name: string, role: 'owner' | 'member' = 'member') =>
    createMember(hh.id, { name, role, activeFrom: '2025-01-01' }, db);
  const alex = person('Alex', 'owner');
  const jordan = person('Jordan');
  const sam = person('Sam');
  const rent = createService(
    hh.id,
    { typeSlug: 'rent', name: 'Rent', provider: 'Agent', payerMemberId: alex.id },
    db,
  );
  const bill = (amountMinor: number, month: string) =>
    createBill(
      hh.id,
      {
        serviceId: rent.id,
        amountMinor,
        periodStart: `${month}-01`,
        periodEnd: `${month}-28`,
        dueDate: `${month}-01`,
        source: 'manual',
      },
      db,
    );
  const shares = (billId: string) =>
    Object.fromEntries(getBill(hh.id, billId, db)!.shares.map((s) => [s.memberId, s.amountMinor]));
  return { hh, alex, jordan, sam, rent, bill, shares };
}

describe('a service split by percentage or set amounts', () => {
  it('splits rent 40/30/30 while water stays even', () => {
    const { hh, alex, jordan, sam, rent, bill, shares } = setup();
    updateService(
      hh.id,
      rent.id,
      { splitMode: 'percent', customSplits: { [jordan.id]: 40, [alex.id]: 30, [sam.id]: 30 } },
      db,
    );
    const b = bill(300000, '2026-10');
    expect(shares(b.id)).toEqual({ [jordan.id]: 120000, [alex.id]: 90000, [sam.id]: 90000 });

    const water = createService(
      hh.id,
      { typeSlug: 'water', name: 'Water', provider: 'Water Co', payerMemberId: alex.id },
      db,
    );
    const w = createBill(
      hh.id,
      {
        serviceId: water.id,
        amountMinor: 9000,
        periodStart: '2026-10-01',
        periodEnd: '2026-10-28',
        dueDate: '2026-10-28',
        source: 'manual',
      },
      db,
    );
    expect(new Set(getBill(hh.id, w.id, db)!.shares.map((s) => s.amountMinor))).toEqual(
      new Set([3000]),
    );
  });

  it('keeps set amounts, shows who pays what, and re-splits only bills nobody has paid', () => {
    const { hh, alex, jordan, sam, rent, bill, shares } = setup();
    const paid = bill(300000, '2026-08');
    const unpaid = bill(300000, '2026-09');
    // Sam paid their share of August.
    const samShare = getBill(hh.id, paid.id, db)!.shares.find((s) => s.memberId === sam.id)!;
    setSharePaid(hh.id, samShare.id, true, { markedByMemberId: sam.id, method: 'transfer' }, db);

    updateService(
      hh.id,
      rent.id,
      { splitMode: 'fixed', fixedAmounts: { [jordan.id]: 120000 } },
      db,
    );
    expect(getFixedAmounts(hh.id, rent.id, db)).toEqual({ [jordan.id]: 120000 });
    expect(resplittableBills(hh.id, rent.id, db).map((b) => b.id)).toEqual([unpaid.id]);
    expect(resplitBills(hh.id, rent.id, db)).toBe(1);
    expect(shares(unpaid.id)).toEqual({ [jordan.id]: 120000, [alex.id]: 90000, [sam.id]: 90000 });
    // August keeps the even split Sam already paid.
    expect(shares(paid.id)).toEqual({ [jordan.id]: 100000, [alex.id]: 100000, [sam.id]: 100000 });

    const view = splitView(hh.id, getBill(hh.id, unpaid.id, db)!.service, db);
    expect(view.mode).toBe('fixed');
    expect(view.amounts).toEqual({ [jordan.id]: '1200.00' });
    expect(view.parts.map((p) => [p.member.name, p.setting.kind, p.exampleMinor])).toEqual([
      ['Alex', 'rest', 90000],
      ['Jordan', 'amount', 120000],
      ['Sam', 'rest', 90000],
    ]);

    // The month's set-aside follows it too.
    const month = projectMonth(hh.id, '2026-11', db, '2026-10-01');
    const byMember = Object.fromEntries(month.setAside.map((s) => [s.member.id, s.minor]));
    expect(byMember[jordan.id]! / month.totalMinor).toBeCloseTo(0.4, 2);
  });
});
