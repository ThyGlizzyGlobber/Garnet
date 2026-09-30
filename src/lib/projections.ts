import { and, eq, inArray } from 'drizzle-orm';
import { getDb, type Db } from '@/db/client';
import { share, type Member } from '@/db/schema';
import { listBills } from '@/lib/bills';
import { daysInclusive, monthOf, overlapDays, todayIn } from '@/lib/dates';
import {
  expectedBills,
  type ExpectedBasis,
  type ExpectedBill,
  type PerDayFallback,
} from '@/lib/expected';
import { getHousehold } from '@/lib/households';
import { dueParts, shareDueDate } from '@/lib/instalments';
import { listMembers } from '@/lib/members';
import { addMonths, monthBounds } from '@/lib/periods';
import { areaMonthCostPerDay } from '@/lib/regional';
import { listServices, splitSettings, type ServiceWithType } from '@/lib/services';
import { computeShares } from '@/lib/splits';
import { normalMonthCostPerDay } from '@/lib/weather-model';

/**
 * A month ahead (or this one), service by service: what's due in it. Every
 * bill counts in full in the month it's due (owner, 2026-10-01): the bills
 * already in, and the bills each service is expected to send (src/lib/
 * expected.ts). This month also takes expected bills that are late. Worked
 * out on every read; nothing is stored.
 */

/** Where a month's figure for a service comes from: bills already in, or how its expected bill was priced. */
type ProjectionMethod = 'known' | ExpectedBasis | 'none';

interface ServiceProjection {
  service: ServiceWithType;
  /** Due in the month: bills already in plus expected ones, minor units. */
  monthMinor: number;
  knownMinor: number;
  expected: ExpectedBill[];
  method: ProjectionMethod;
}

export interface MonthProjection {
  month: string;
  totalMinor: number;
  services: ServiceProjection[];
  /** Per member: their share of everything due in the month, following each service's split. */
  setAside: { member: Member; minor: number }[];
  /** Equal-share convenience figure for the wall and headline. */
  setAsideEach: number | null;
  computedAt: string;
}

/**
 * A cost per day for a service's expected bill with no bill a year earlier:
 * normal weather for a service that changes with the seasons (scope S3), else,
 * with one bill or none of its own, the area's typical cost (scope S4); each
 * month of the period weighted by its days.
 */
export function perDayFallback(
  householdId: string,
  svc: Pick<ServiceWithType, 'id' | 'seasonal' | 'typeSlug'>,
  today: string,
  db: Db = getDb(),
): PerDayFallback {
  const over = (start: string, end: string, perMonth: (m: string) => number | null) => {
    let sum = 0;
    let days = 0;
    for (let m = monthOf(start); m <= monthOf(end); m = addMonths(m, 1)) {
      const b = monthBounds(m);
      const d = overlapDays(start, end, b.start, b.end);
      const v = perMonth(m);
      if (v === null) return null;
      sum += v * d;
      days += d;
    }
    return days ? sum / days : null;
  };
  return (start, end, count) => {
    if (svc.seasonal) {
      const perDay = over(start, end, (m) => normalMonthCostPerDay(householdId, svc.id, m, db));
      if (perDay !== null) return { perDay, basis: 'weather' };
    }
    if (count <= 1) {
      const perDay = over(start, end, (m) =>
        areaMonthCostPerDay(householdId, svc.typeSlug, m, today, db),
      );
      if (perDay !== null) return { perDay, basis: 'area' };
    }
    return null;
  };
}

export function projectMonth(
  householdId: string,
  month: string,
  db: Db = getDb(),
  today: string = todayIn(getHousehold(householdId, db)?.timezone ?? 'UTC'),
): MonthProjection {
  const thisMonth = today.slice(0, 7);
  const services = listServices(householdId, {}, db);
  const members = listMembers(householdId, db);
  const bills = listBills(householdId, {}, db);
  const inMonth = (d: string) => d.slice(0, 7) === month;
  const rows: ServiceProjection[] = [];
  const byMember = new Map<string, number>();
  const add = (memberId: string, minor: number) =>
    byMember.set(memberId, (byMember.get(memberId) ?? 0) + minor);

  // Shares of the bills already in, each on the day its part is due.
  const knownIds: string[] = [];
  for (const svc of services) {
    const own = bills.filter((b) => b.serviceId === svc.id);
    const parts = own.flatMap((b) => dueParts(b).filter((p) => inMonth(p.dueDate)));
    for (const b of own) if (dueParts(b).some((p) => inMonth(p.dueDate))) knownIds.push(b.id);
    const knownMinor = parts.reduce((s, p) => s + p.amountMinor, 0);
    // Expected bills: none in a month gone by; this month takes late ones too.
    const expected =
      month < thisMonth
        ? []
        : expectedBills(svc, own, month, perDayFallback(householdId, svc, today, db)).filter((e) =>
            month === thisMonth ? e.dueDate.slice(0, 7) <= month : inMonth(e.dueDate),
          );
    const expectedMinor = expected.reduce((s, e) => s + e.amountMinor, 0);
    rows.push({
      service: svc,
      monthMinor: knownMinor + expectedMinor,
      knownMinor,
      expected,
      method: expected.length ? expected[0]!.basis : parts.length ? 'known' : 'none',
    });
    // Set amounts are per bill, so an expected one splits like the latest.
    for (const e of expected) {
      if (e.amountMinor <= 0 || daysInclusive(e.periodStart, e.periodEnd) <= 0) continue;
      const shares = computeShares({
        amountMinor: e.amountMinor,
        periodStart: e.periodStart,
        periodEnd: e.periodEnd,
        splitMode: svc.splitMode,
        members,
        ...splitSettings(householdId, svc, db),
        referenceAmountMinor: own[0]?.amountMinor,
        payerMemberId: svc.payerMemberId,
      });
      for (const s of shares) add(s.memberId, s.amountMinor);
    }
  }
  if (knownIds.length) {
    const due = new Map(bills.map((b) => [b.id, b]));
    const rowsOfShares = db
      .select()
      .from(share)
      .where(and(eq(share.householdId, householdId), inArray(share.billId, knownIds)))
      .all();
    for (const s of rowsOfShares)
      if (inMonth(shareDueDate(s, due.get(s.billId)!))) add(s.memberId, s.amountMinor);
  }

  const totalMinor = rows.reduce((s, r) => s + r.monthMinor, 0);
  const setAside = members
    .filter((m) => byMember.has(m.id))
    .map((m) => ({ member: m, minor: byMember.get(m.id) ?? 0 }));
  const setAsideEach = setAside.length
    ? Math.round(setAside.reduce((s, x) => s + x.minor, 0) / setAside.length)
    : null;
  return {
    month,
    totalMinor,
    services: rows,
    setAside,
    setAsideEach,
    computedAt: new Date().toISOString(),
  };
}

/** The month after the current one, which is what "set aside" is for. */
export function nextMonth(today: string): string {
  return addMonths(monthOf(today), 1);
}
