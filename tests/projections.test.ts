import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { openDb, type Db } from '@/db/client';
import { runMigrations } from '@/db/migrate';
import { createBill } from '@/lib/bills';
import { createHousehold } from '@/lib/households';
import { createMember } from '@/lib/members';
import { estimatePerDay, nextBillGuess, projectMonth } from '@/lib/projections';
import { remindersFor, summariseReminders } from '@/lib/reminders';
import { createService } from '@/lib/services';

const m = (amt: number, start: string, end: string) => ({
  amountMinor: amt,
  periodStart: start,
  periodEnd: end,
});

describe('estimatePerDay', () => {
  it('handles no history and a single bill', () => {
    expect(estimatePerDay([], '2026-10').method).toBe('none');
    const one = estimatePerDay([m(3000, '2026-09-01', '2026-09-30')], '2026-10');
    expect(one.method).toBe('single');
    expect(one.perDay).toBe(100);
  });
  it('uses the recent average when there is no same-month history', () => {
    const r = estimatePerDay(
      [
        m(3000, '2026-06-01', '2026-06-30'),
        m(3100, '2026-07-01', '2026-07-31'),
        m(3000, '2026-08-01', '2026-08-31'),
      ],
      '2026-10',
    );
    expect(r.method).toBe('recent');
    expect(r.perDay).toBeCloseTo((100 + 100 + 96.77) / 3, 1);
  });
  it('goes seasonal once last year covers the target month, with bounded drift', () => {
    const bills = [
      m(3000, '2025-08-01', '2025-08-31'),
      m(3000, '2025-09-01', '2025-09-30'),
      m(6000, '2025-10-01', '2025-10-31'), // winter gas spike last year
      m(3000, '2026-07-01', '2026-07-31'),
      m(3300, '2026-08-01', '2026-08-31'),
      m(3300, '2026-09-01', '2026-09-30'),
    ];
    const r = estimatePerDay(bills, '2026-10');
    expect(r.method).toBe('seasonal');
    // last year's October per-day (~193.5) × drift (recent ~106 vs before ~98 → ~1.08)
    expect(r.perDay).toBeGreaterThan(190);
    expect(r.perDay).toBeLessThan(230);
  });
});

describe('nextBillGuess', () => {
  it('projects the next period and due date from the cadence', () => {
    const n = nextBillGuess(
      { periodStart: '2026-09-14', periodEnd: '2026-10-13', dueDate: '2026-09-28' },
      'monthly',
      430,
    )!;
    expect(n.periodStart).toBe('2026-10-14');
    expect(n.periodEnd).toBe('2026-11-13');
    expect(n.dueDate).toBe('2026-10-28');
    expect(n.amountMinor).toBe(430 * 31);
  });
  it('returns null with no history', () => {
    expect(nextBillGuess(undefined, 'monthly', 1)).toBeNull();
  });
});

describe('projectMonth + reminders', () => {
  let dir: string;
  let db: Db;
  let close: () => void;
  let a: string;
  let b: string;
  beforeAll(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hud-proj-'));
    runMigrations(dir);
    const o = openDb(dir);
    db = o.db;
    close = () => o.sqlite.close();
    createHousehold(
      {
        name: 'H',
        currency: 'AUD',
        locale: 'en-AU',
        timezone: 'Australia/Melbourne',
        fiscalYearStartMonth: 7,
        splitMode: 'shared',
      },
      db,
    );
    a = createMember({ name: 'A', pinHash: 'x', role: 'owner', activeFrom: '2025-01-01' }, db).id;
    b = createMember({ name: 'B', pinHash: 'x', activeFrom: '2025-01-01' }, db).id;
    const net = createService(
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
    const p = projectMonth('2026-10', db);
    expect(p.services).toHaveLength(1);
    expect(p.services[0]?.method).toBe('recent');
    // Mean daily cost of the last three bills (100, 100, 103.3) × 31 days.
    expect(p.totalMinor).toBe(3134);
    expect(p.setAside.map((s) => s.minor).sort()).toEqual([1567, 1567]);
    expect(p.setAsideEach).toBe(1567);
    // Cached row exists and is idempotent on re-run.
    expect(projectMonth('2026-10', db).totalMinor).toBe(3134);
  });

  it('counts known accrual in a partly billed month', () => {
    // September is fully billed, so its "projection" is just the known cost.
    const p = projectMonth('2026-09', db);
    expect(p.totalMinor).toBe(3100);
  });

  it('ranks reminders by urgency', () => {
    const rs = remindersFor(b, '2026-09-10', 7, db);
    expect(rs.map((r) => r.level)).toEqual(['overdue', 'overdue', 'due_soon']);
    const sum = summariseReminders(rs);
    expect(sum.overdueCount).toBe(2);
    expect(sum.soonCount).toBe(1);
    expect(sum.overdueMinor).toBe(3100);
  });
});
