import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { openDb, type Db } from '@/db/client';
import { runMigrations } from '@/db/migrate';
import { linkMember, signInAccount } from '@/lib/accounts';
import {
  createBill,
  recordPayment,
  setInstalmentPaid,
  setPaymentPlan,
  setSharePaid,
} from '@/lib/bills';
import { devOutbox } from '@/lib/email';
import { formatMonthRange, formatPeriod } from '@/lib/format';
import { createHousehold } from '@/lib/households';
import { createMember } from '@/lib/members';
import { moneyView } from '@/lib/money';
import { remindDebtors } from '@/lib/notifications';
import { serviceOverview } from '@/lib/service-overview';
import { createService } from '@/lib/services';
import { servicesMonth } from '@/lib/services-month';

/**
 * The shown screens' view functions (redesign R5): the Services ribbons, a
 * service's figures, and Money with its two actions.
 */
let dir: string;
let db: Db;
let close: () => void;

beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hud-screens-'));
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
let n = 0;

/** Alex (admin, pays power and rent), Jordan and Sam (joined), power bills for two years, a personal rego. */
function setup() {
  const tag = `s${++n}`;
  const hh = createHousehold(
    {
      name: `Riverside ${tag}`,
      currency: 'AUD',
      locale: 'en-AU',
      timezone: 'Australia/Melbourne',
      fiscalYearStartMonth: 7,
      splitMode: 'shared',
    },
    db,
  );
  const person = (name: string, role: 'owner' | 'member') => {
    const m = createMember(hh.id, { name, role, activeFrom: '2025-01-01' }, db);
    const a = signInAccount({ email: `${name.toLowerCase()}.${tag}@example.com` }, db);
    linkMember(m.id, a.id, a.email, db);
    return m;
  };
  const alex = person('Alex', 'owner');
  const jordan = person('Jordan', 'member');
  const sam = person('Sam', 'member');
  const power = createService(
    hh.id,
    {
      typeSlug: 'electricity',
      name: 'Electricity',
      provider: 'Northwind',
      payerMemberId: alex.id,
      cadence: 'quarterly',
      usageUnit: 'kWh',
    },
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
  const quarter = (start: string, end: string, due: string, amount: number, usage: number) =>
    createBill(
      hh.id,
      {
        serviceId: power.id,
        amountMinor: amount,
        periodStart: start,
        periodEnd: end,
        dueDate: due,
        source: 'manual',
        usageQuantity: usage,
        usageUnit: 'kWh',
        issueDate: end,
      },
      db,
    );
  quarter('2025-06-01', '2025-08-31', '2025-09-20', 42_000, 1500);
  quarter('2025-09-01', '2025-11-30', '2025-12-20', 30_000, 1100);
  quarter('2025-12-01', '2026-02-28', '2026-03-20', 32_000, 1150);
  quarter('2026-03-01', '2026-05-31', '2026-06-20', 31_000, 1120);
  const latest = quarter('2026-06-01', '2026-08-31', '2026-09-20', 48_621, 1684);
  createBill(
    hh.id,
    {
      serviceId: rego.id,
      amountMinor: 91_250,
      periodStart: '2026-10-18',
      periodEnd: '2027-10-17',
      dueDate: '2026-10-18',
      source: 'manual',
    },
    db,
  );
  return { hh, alex, jordan, sam, power, rego, latest };
}

describe('servicesMonth', () => {
  it('lists what each service has due in a month, how it compares, and what is still to come', () => {
    const { hh, alex, jordan, power, latest } = setup();
    // The latest power bill is due 20 Sep.
    const sep = servicesMonth(hh, alex.id, TODAY, undefined, 'all', db);
    expect([sep.month, sep.prev, sep.next]).toEqual(['2026-09', '2026-08', '2026-10']);
    // Alex sees the household's service, not Jordan's rego.
    expect(sep.entries).toHaveLength(1);
    const e = sep.entries[0]!;
    if (e.kind !== 'service') throw new Error('not a service');
    expect(e.item.service.id).toBe(power.id);
    expect(e.item.bills.map((b) => b.bill.id)).toEqual([latest.id]);
    expect(e.item.amountMinor).toBe(48_621);
    expect(e.item.status?.key).toBe('overdue');
    // Against the bill before it (due 20 Jun).
    expect(e.item.change).toMatchObject({ dir: 'up', month: '2026-06' });
    expect(e.item.change!.pct).toBeCloseTo(48_621 / 31_000 - 1, 5);
    expect(sep.totalMinor).toBe(48_621);
    expect(sep.counts).toMatchObject({ bills: 1, paid: 0, overdue: 1 });

    // October: nothing due for power; the next bill is expected in December.
    const oct = servicesMonth(hh, alex.id, TODAY, '2026-10', 'all', db);
    expect(oct.next).toBeNull();
    const o = oct.entries[0]!;
    if (o.kind !== 'service') throw new Error('not a service');
    expect(o.item.bills).toEqual([]);
    expect(o.item.expected?.dueDate).toBe('2026-12-21');
    expect(oct.counts.toCome).toBe(0);

    // Jordan's rego, due 18 Oct, is in October, under Vehicles.
    const jo = servicesMonth(hh, jordan.id, TODAY, '2026-10', 'all', db);
    const vehicles = jo.entries.find((x) => x.kind === 'group');
    expect(vehicles).toMatchObject({ kind: 'group', category: 'vehicle', amountMinor: 91_250 });
    expect(vehicles?.kind === 'group' && vehicles.status?.key).toBe('due');
    const mine = servicesMonth(hh, jordan.id, TODAY, '2026-10', 'mine', db);
    expect(mine.entries).toHaveLength(1);
    expect(mine.totalMinor).toBe(91_250);
  });
});

describe('serviceOverview', () => {
  it('gives the year’s figures, a bar per bill and the bills by year', () => {
    const { hh, alex, power } = setup();
    const svc = { ...power, type: { icon: 'bolt' } } as unknown as Parameters<
      typeof serviceOverview
    >[1];
    const o = serviceOverview(hh, svc, TODAY, db);
    // The last complete financial year (Jul 2025 – Jun 2026) had bills, so it is the year shown.
    expect(o.stats.year.current).toBe(false);
    expect(o.stats.year.label).toContain('2025');
    expect(o.stats.year.bills).toBe(5);
    expect(o.stats.year.perMonthMinor).toBeGreaterThan(0);
    expect(o.stats.latest?.amountMinor).toBe(48_621);
    expect(o.stats.next?.dueDate).toBe('2026-12-21');
    expect(o.barsAreUsage).toBe(true);
    expect(o.bars.map((b) => b.periodStart)).toEqual([
      '2025-06-01',
      '2025-09-01',
      '2025-12-01',
      '2026-03-01',
      '2026-06-01',
    ]);
    expect(o.bars[4]!.value).toBeCloseTo(1684 / 92, 3);
    expect(o.byYear.map((y) => [y.year, y.bills.length])).toEqual([
      ['2026', 2],
      ['2025', 3],
    ]);
    expect(o.split?.parts.map((p) => p.member.name)).toEqual(['Alex', 'Jordan', 'Sam']);
    expect(alex.id).toBeTruthy();
  });
});

describe('moneyView', () => {
  it('shows what the viewer owes, what is owed to them, and what is between the others', () => {
    const { hh, alex, jordan, sam, latest } = setup();
    const v = moneyView(hh.id, alex.id, TODAY, 7, db);
    // Alex pays power: Jordan and Sam each owe a third of five bills.
    expect(v.youOwe).toEqual([]);
    expect(v.owedToYou).toHaveLength(10);
    expect(v.owedToYouMinor).toBe(v.netMinor);
    expect(v.between).toEqual([]);
    expect(
      v.people.map((p) => [p.member.name, p.netMinor > 0, p.sharesThisFy, p.paidThisFy]),
    ).toEqual([
      ['Jordan', true, 0, 0],
      ['Sam', true, 0, 0],
    ]);
    const latestDebt = v.owedToYou.find((d) => d.billId === latest.id && d.fromId === jordan.id)!;
    expect(latestDebt).toMatchObject({
      toId: alex.id,
      dueDate: '2026-09-20',
      serviceName: 'Electricity',
      icon: 'bolt',
    });
    // From Jordan's side: they owe Alex; Sam's debts are between housemates.
    const j = moneyView(hh.id, jordan.id, TODAY, 7, db);
    expect(j.youOwe).toHaveLength(5);
    expect(j.netMinor).toBeLessThan(0);
    expect(j.creditors.map((c) => c.member.name)).toEqual(['Alex']);
    expect(j.between.every((d) => d.fromId === sam.id && d.toId === alex.id)).toBe(true);
    expect(j.people.map((p) => p.member.name)).toEqual(['Alex', 'Sam']);
  });

  it('records one payment across several shares, and only the right ones', () => {
    const { hh, alex, jordan, sam } = setup();
    const before = moneyView(hh.id, alex.id, TODAY, 7, db);
    const jordans = before.owedToYou.filter((d) => d.fromId === jordan.id).slice(0, 2);
    const sams = before.owedToYou.find((d) => d.fromId === sam.id)!;
    const r = recordPayment(
      hh.id,
      {
        shareIds: [...jordans.map((d) => d.shareId), sams.shareId, 'nonsense'],
        fromMemberId: jordan.id,
        toMemberId: alex.id,
        method: 'cash',
        day: '2026-09-28',
        markedByMemberId: alex.id,
      },
      db,
    );
    // Sam's share and the unknown id are left alone.
    expect(r.shareIds.sort()).toEqual(jordans.map((d) => d.shareId).sort());
    expect(r.totalMinor).toBe(jordans.reduce((s, d) => s + d.amountMinor, 0));
    const after = moneyView(hh.id, alex.id, TODAY, 7, db);
    expect(after.owedToYou).toHaveLength(8);
    expect(after.people.find((p) => p.member.name === 'Jordan')!.paidThisFy).toBe(0);
  });

  it('reminds each debtor by email once a day', async () => {
    const { hh, alex, jordan, sam } = setup();
    const at = new Date('2026-09-29T00:00:00Z');
    const r1 = await remindDebtors(hh.id, alex.id, at, db);
    expect(r1.sent.sort()).toEqual(['Jordan', 'Sam']);
    const toJordan = devOutbox.filter(
      (e) => e.to.startsWith('jordan.') && e.subject.includes('Alex'),
    );
    expect(toJordan.length).toBeGreaterThan(0);
    expect(toJordan.at(-1)!.text).toContain('Electricity');
    // The same day: nobody is emailed again.
    const r2 = await remindDebtors(hh.id, alex.id, at, db);
    expect(r2).toEqual({
      sent: [],
      already: ['Jordan', 'Sam'].sort((a, b) => a.localeCompare(b)),
      unreachable: [],
    });
    // The next day they can be.
    const r3 = await remindDebtors(hh.id, alex.id, new Date('2026-09-30T00:00:00Z'), db);
    expect(r3.sent.sort()).toEqual(['Jordan', 'Sam']);
    // Someone who owes nothing is never emailed; someone owed nothing gets no reminders to send.
    expect((await remindDebtors(hh.id, sam.id, at, db)).sent).toEqual([]);
    expect(jordan.id).toBeTruthy();
  });

  it('lists a bill by instalments as one debt, the next unpaid instalment', () => {
    const { hh, alex, jordan, power } = setup();
    const rates = createService(
      hh.id,
      { typeSlug: 'council_rates', name: 'Rates', provider: 'City', payerMemberId: alex.id },
      db,
    );
    const b = createBill(
      hh.id,
      {
        serviceId: rates.id,
        amountMinor: 200_000,
        periodStart: '2026-07-01',
        periodEnd: '2027-06-30',
        dueDate: '2026-09-30',
        source: 'manual',
        instalments: [
          { dueDate: '2026-09-30', amountMinor: 50_000 },
          { dueDate: '2026-11-30', amountMinor: 50_000 },
          { dueDate: '2027-02-28', amountMinor: 50_000 },
          { dueDate: '2027-05-31', amountMinor: 50_000 },
        ],
      },
      db,
    );
    setPaymentPlan(hh.id, b.id, 'instalments', db, TODAY);
    setInstalmentPaid(hh.id, b.id, 1, true, db);
    const v = moneyView(hh.id, alex.id, TODAY, 7, db);
    const ratesDebts = v.owedToYou.filter(
      (d) => d.serviceName === 'Rates' && d.fromId === jordan.id,
    );
    // Only the next unpaid instalment is owed now, whatever the provider has been paid.
    expect(ratesDebts.map((d) => d.instalment)).toEqual([1]);
    expect(ratesDebts[0]!.dueDate).toBe('2026-09-30');
    setSharePaid(hh.id, ratesDebts[0]!.shareId, true, {}, db);
    const after = moneyView(hh.id, alex.id, TODAY, 7, db).owedToYou.filter(
      (d) => d.serviceName === 'Rates' && d.fromId === jordan.id,
    );
    expect(after.map((d) => d.instalment)).toEqual([2]);
    expect(after[0]!.dueDate).toBe('2026-11-30');
    expect(power.id).toBeTruthy();
  });
});

describe('formatMonthRange', () => {
  it('reads as months, with years only when they differ', () => {
    expect(formatMonthRange('2026-06-01', '2026-08-31', 'en-AU')).toBe('Jun – Aug');
    expect(formatMonthRange('2026-08-01', '2026-08-31', 'en-AU')).toBe('August');
    expect(formatPeriod('2026-10-18', '2027-10-17', 'en-AU')).toBe('18 Oct 2026 – 17 Oct 2027');
    expect(formatPeriod('2026-06-01', '2026-08-31', 'en-AU')).toBe('Jun – Aug');
    expect(formatMonthRange('2025-12-01', '2026-02-28', 'en-AU')).toBe('Dec 2025 – Feb 2026');
  });
});
