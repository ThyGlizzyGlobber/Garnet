import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { openDb, type Db } from '@/db/client';
import { runMigrations } from '@/db/migrate';
import { createBill, getBill } from '@/lib/bills';
import { createHousehold } from '@/lib/households';
import { createMember } from '@/lib/members';
import { createService } from '@/lib/services';
import {
  dashboardSummary,
  householdBalances,
  memberLedger,
  monthlySeries,
  totalsForRange,
} from '@/lib/stats';

let dir: string;
let db: Db;
let hid: string;
let close: () => void;
let a: string;
let b: string;
let net: string;
let power: string;

beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hud-stats-'));
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
  net = createService(
    hid,
    { typeSlug: 'internet', name: 'Internet', provider: 'P', payerMemberId: a },
    db,
  ).id;
  power = createService(
    hid,
    { typeSlug: 'electricity', name: 'Power', provider: 'Q', payerMemberId: b, usageUnit: 'kWh' },
    db,
  ).id;
  // Monthly internet, $100 each, Jul–Sep 2026.
  for (const m of ['2026-07', '2026-08', '2026-09']) {
    createBill(
      hid,
      {
        serviceId: net,
        amountMinor: 10000,
        periodStart: `${m}-01`,
        periodEnd: `${m}-30`,
        dueDate: `${m}-15`,
        source: 'manual',
        externalRef: m,
        paidToProviderAt: m < '2026-09' ? 'x' : null,
      },
      db,
    );
  }
  // Quarterly power Jul–Sep 2026 $300 → $100/month accrued.
  createBill(
    hid,
    {
      serviceId: power,
      amountMinor: 30000,
      periodStart: '2026-07-01',
      periodEnd: '2026-09-30',
      dueDate: '2026-10-20',
      source: 'manual',
      externalRef: 'Q3',
    },
    db,
  );
});

afterAll(() => {
  close();
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('monthly series', () => {
  it('accrues bills into months per service', () => {
    const rows = monthlySeries(hid, ['2026-07', '2026-08', '2026-09'], db);
    expect(rows.map((r) => r.total)).toEqual([20108, 20108, 19784]); // 92-day quarter, remainder to September
    expect(rows[0]?.byService[power]).toBe(10108);
    expect(rows.reduce((t, r) => t + (r.byService[power] ?? 0), 0)).toBe(30000);
  });
  it('totals a range with the same accrual', () => {
    const t = totalsForRange(hid, '2026-08-01', '2026-08-31', db);
    expect(t.total).toBe(20109); // 10000 + round(30000 × 31 / 92)
    expect(t.byService[0]?.minor).toBe(10109);
  });
});

describe('dashboard summary', () => {
  it('reports this month, upcoming and overdue', () => {
    const s = dashboardSummary(hid, '2026-09-20', 7, db);
    expect(s.thisMonth.total).toBe(19783); // 10000 + round(30000 × 30 / 92)
    expect(s.lastMonthTotal).toBe(20109);
    expect(s.fiscalYear.label).toBe('2026–27');
    expect(s.overdue.map((x) => x.externalRef)).toEqual(['2026-09']); // due 15 Sep, unpaid
    expect(s.upcoming.map((x) => x.externalRef)).toEqual(['Q3']);
    expect(s.upcoming[0]?.daysUntilDue).toBe(30);
    expect(s.activeMemberCount).toBe(2);
    expect(s.costPerPersonPerDay).toBe(Math.round(19783 / 30 / 2));
  });
});

describe('ledger', () => {
  it('shows what a member owes and is owed', () => {
    const lb = memberLedger(hid, b, '2026-09-20', 7, db)!;
    // B owes A half of each internet bill (3 × 5000); A owes B half of power (15000).
    expect(lb.owed).toBe(15000);
    expect(lb.unpaid).toHaveLength(3);
    expect(lb.owedToMe).toBe(15000);
    expect(lb.owedToMeBy[0]?.member.id).toBe(a);
    const balances = householdBalances(hid, db);
    expect(balances.find((x) => x.member.id === a)?.owed).toBe(15000);
    expect(balances.find((x) => x.member.id === b)?.unpaidCount).toBe(3);
  });
});

describe('anomaly flag on create', () => {
  it('flags a bill far above the prior median', () => {
    const big = createBill(
      hid,
      {
        serviceId: net,
        amountMinor: 20000,
        periodStart: '2026-10-01',
        periodEnd: '2026-10-30',
        dueDate: '2026-10-15',
        source: 'manual',
        externalRef: 'big',
      },
      db,
    );
    expect(big.isAnomaly).toBe(true);
    expect(getBill(hid, big.id, db)?.anomalyNote).toMatch(/100% above/);
    const normal = createBill(
      hid,
      {
        serviceId: net,
        amountMinor: 10000,
        periodStart: '2026-11-01',
        periodEnd: '2026-11-30',
        dueDate: '2026-11-15',
        source: 'manual',
        externalRef: 'ok',
      },
      db,
    );
    expect(normal.isAnomaly).toBe(false);
  });
});
