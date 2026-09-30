import { getDb, type Db } from '@/db/client';
import type { Household } from '@/db/schema';
import { costPerDay } from '@/lib/averages';
import { billDue } from '@/lib/bill-status';
import { listBills, type BillListItem } from '@/lib/bills';
import { compareUsage, usageHistory, type Change } from '@/lib/consumption';
import { MONTHS_PER_BILL } from '@/lib/cadence';
import { addMonths, fiscalYearBounds, monthBounds } from '@/lib/periods';
import { eachBill, expectedBills } from '@/lib/expected';
import { dueParts } from '@/lib/instalments';
import { perDayFallback } from '@/lib/projections';
import { areaComparison } from '@/lib/regional';
import { recurringView } from '@/lib/recurring';
import { seasonAhead } from '@/lib/seasons';
import type { ServiceWithType } from '@/lib/services';
import { splitView } from '@/lib/split-view';
import { weatherAdjusted } from '@/lib/weather-model';

const changeOf = (from: number, to: number): Change => ({
  from,
  to,
  pct: from ? (to - from) / from : null,
});

/** What a bill had due in [start, end]: the bill in full on its due date, or its instalments due then. */
function dueWithin(b: BillListItem, start: string, end: string): number {
  return dueParts(b)
    .filter((p) => p.dueDate >= start && p.dueDate <= end)
    .reduce((s, p) => s + p.amountMinor, 0);
}

/** One bar on the service page's chart: a bill's period and its usage, or its cost (per day or per bill). */
export interface ServiceBar {
  billId: string;
  periodStart: string;
  periodEnd: string;
  /** Usage per day in the service's unit, else the bill's cost (per bill or per day) in minor units. */
  value: number;
  amountMinor: number;
  usage: number | null;
  unusual: boolean;
}

/**
 * Everything a service's page shows, worked out here so the page only formats
 * it: the year's figures, usage and how it compares (previous bill, last
 * year, average, the household's limit, similar households), each bill as a
 * bar, the weather's part in the change, households in the area, the next
 * three months' estimates, how it's split, and every bill by year.
 */
export function serviceOverview(
  hh: Household,
  svc: ServiceWithType,
  today: string,
  db: Db = getDb(),
) {
  const c = compareUsage(hh.id, svc.id, db);
  const history = usageHistory(hh.id, svc.id, db);
  const before = c?.previous?.period.parts ?? [];
  const bills = listBills(hh.id, { serviceId: svc.id }, db);
  const latest = bills[0];

  const comparisons: {
    against: 'previous' | 'lastYear' | 'average' | 'limit' | 'similar';
    usage: Change;
    cost?: Change;
    /** How many bills the average is of. */
    bills?: number;
    /** The household's monthly limit, in the usage unit. */
    limit?: number;
    /** The period compared with, when it is one bill. */
    period?: { periodStart: string; periodEnd: string; perDay: number | null };
  }[] = [];
  if (c?.lastYear)
    comparisons.push({
      against: 'lastYear',
      usage: c.lastYear.usage,
      cost: c.lastYear.cost,
      period: c.lastYear.period,
    });
  if (c?.previous)
    comparisons.push({
      against: 'previous',
      usage: c.previous.usage,
      cost: c.previous.cost,
      period: c.previous.period,
    });
  if (c?.average)
    comparisons.push({
      against: 'average',
      usage: c.average.usage,
      cost: c.average.cost,
      bills: c.average.bills,
    });
  if (c?.limit)
    comparisons.push({ against: 'limit', usage: c.limit.usage, limit: c.limit.monthly });
  if (c?.similarHouseholds) comparisons.push({ against: 'similar', usage: c.similarHouseholds });

  // The year's figures: the last complete financial year when it had bills,
  // else the current one so far.
  const thisFy = fiscalYearBounds(today, hh.fiscalYearStartMonth);
  const lastFy = fiscalYearBounds(
    addMonths(thisFy.start.slice(0, 7), -1) + '-01',
    hh.fiscalYearStartMonth,
  );
  // Every figure counts a bill in full when it's due (owner, 2026-10-01).
  const inFy = (fy: { start: string; end: string }) =>
    bills.filter((b) => dueWithin(b, fy.start, fy.end) > 0);
  const year = inFy(lastFy).length ? { ...lastFy, current: false } : { ...thisFy, current: true };
  const yearEnd = year.end > today ? today : year.end;
  const yearBills = bills.filter((b) => dueWithin(b, year.start, yearEnd) > 0);
  const yearMinor = yearBills.reduce((s, b) => s + dueWithin(b, year.start, yearEnd), 0);
  const unit = history?.unit ?? svc.usageUnit;
  const calendar = !!MONTHS_PER_BILL[svc.cadence];

  // What's expected: the next bill, and the next three months' bills.
  const expected = expectedBills(
    svc,
    bills,
    addMonths(today.slice(0, 7), 12),
    perDayFallback(hh.id, svc, today, db),
  );
  const guess = expected[0] ?? null;
  const barsAreUsage = !!unit && (history?.periods ?? []).some((p) => p.perDay !== null);
  // Recurring: the next charge is expected at the latest bill's price.
  const recurring = recurringView(svc, bills);
  const usageOf = new Map((history?.periods ?? []).map((p) => [p.billId, p.perDay]));

  const byYear = new Map<string, BillListItem[]>();
  for (const b of bills) {
    const y = b.periodStart.slice(0, 4);
    byYear.set(y, [...(byYear.get(y) ?? []), b]);
  }

  return {
    usage: c,
    unit,
    comparisons,
    stats: {
      year: {
        label: year.label,
        current: year.current,
        minor: yearMinor,
        bills: yearBills.length,
      },
      /** What a bill costs when it comes, and how often. */
      each: eachBill(svc, bills, today),
      latest: latest
        ? {
            billId: latest.id,
            amountMinor: billDue(latest, today).amountMinor,
            status: billDue(latest, today).status,
          }
        : null,
      next: guess
        ? { amountMinor: guess.amountMinor, dueDate: guess.dueDate, method: guess.basis }
        : null,
    },
    /**
     * Each bill, oldest first, as a bar: usage per day when the service has
     * usage; else the bill's cost when its bills follow the calendar (a
     * month's internet is $129 whether the month has 30 days or 31), else its
     * cost per day.
     */
    bars: [...bills].reverse().map((b): ServiceBar => ({
      billId: b.id,
      periodStart: b.periodStart,
      periodEnd: b.periodEnd,
      value:
        unit && usageOf.get(b.id) != null
          ? usageOf.get(b.id)!
          : calendar
            ? b.amountMinor
            : costPerDay(b),
      amountMinor: b.amountMinor,
      usage: usageOf.get(b.id) ?? null,
      unusual: b.isAnomaly,
    })),
    /** Recurring: on or not, the next charge (upcoming), and a price change on the latest bill. */
    recurring,
    /**
     * A fixed price (internet, a subscription): bills that follow the
     * calendar and cost within 15% of each other over the last twelve, drawn
     * as a price over time instead of bars of one height. Null otherwise.
     */
    price: fixedPriceHistory(bills, calendar && !barsAreUsage, recurring.upcoming, today),
    /** Bars measure usage per day (true) or cost (false). */
    barsAreUsage,
    /** Cost bars are each bill's cost (true) or its cost per day (false). */
    barsPerBill: !barsAreUsage && calendar,
    /** The latest bill's usage by tariff band, each against the bill before. */
    bands: (c?.latest.parts ?? []).map((p) => {
      const was = before.find((b) => b.key === p.key);
      return { ...p, change: was ? changeOf(was.perDay, p.perDay) : null };
    }),
    weather: svc.seasonal ? weatherAdjusted(hh.id, svc.id, db) : null,
    seasons: seasonAhead(hh.id, today, db).filter((n) => n.serviceId === svc.id),
    // "Households like yours" (scope S4): only for households that share.
    area: areaComparison(hh.id, svc.id, today, db),
    /** The next three months' estimates, and what each is based on. */
    comingUp: [0, 1, 2].map((i) => {
      const month = addMonths(today.slice(0, 7), i);
      const { start, end } = monthBounds(month);
      const known = bills.reduce((sum, b) => sum + dueWithin(b, start, end), 0);
      // This month also takes an expected bill that's late.
      const due = expected.filter((e) =>
        i === 0 ? e.dueDate.slice(0, 7) <= month : e.dueDate.slice(0, 7) === month,
      );
      return {
        month,
        minor: known + due.reduce((sum, e) => sum + e.amountMinor, 0),
        method: due[0]?.basis ?? (known ? ('known' as const) : ('none' as const)),
      };
    }),
    // Who pays what (household services, in households that split bills).
    split: hh.splitMode === 'shared' && !svc.ownerMemberId ? splitView(hh.id, svc, db) : null,
    /** The latest bill, when it is unusual: how far off and against what. */
    unusual: latest?.isAnomaly ? unusualOf(latest) : null,
    bills,
    /** Every bill by year, newest year first, with the year's total. */
    byYear: [...byYear.entries()]
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([year, list]) => ({
        year,
        bills: list,
        totalMinor: list.reduce((s, b) => s + b.amountMinor, 0),
      })),
  };
}

/** How far off an unusual bill is, read back from its stored note ("38% above …"). */
export function unusualOf(b: {
  id: string;
  anomalyNote: string | null;
  anomalyBasis: 'last_year' | 'recent' | 'seasonal_allowance' | null;
}): { billId: string; pct: number | null; basis: typeof b.anomalyBasis; note: string | null } {
  const m = /^(\d+)% (above|below)/.exec(b.anomalyNote ?? '');
  return {
    billId: b.id,
    pct: m ? (Number(m[1]) / 100) * (m[2] === 'above' ? 1 : -1) : null,
    basis: b.anomalyBasis,
    note: b.anomalyNote,
  };
}

/**
 * A fixed price over time: the last twelve bills (oldest first) with their
 * status, the next expected charge, the current price and since when, and the
 * price before it. Null unless its bills follow the calendar and stay within
 * 15% of each other.
 */
function fixedPriceHistory(
  bills: BillListItem[],
  calendar: boolean,
  upcoming: { dueDate: string; amountMinor: number } | null,
  today: string,
) {
  const recent = bills.slice(0, 12).reverse();
  if (!calendar || recent.length < 2) return null;
  const amounts = recent.map((b) => b.amountMinor);
  const hi = Math.max(...amounts);
  if (hi <= 0 || (hi - Math.min(...amounts)) / hi > 0.15) return null;
  const current = recent.at(-1)!.amountMinor;
  // The run of bills at today's price, and the price before it.
  let from = recent.length - 1;
  while (from > 0 && recent[from - 1]!.amountMinor === current) from--;
  return {
    bills: recent.map((b) => ({ bill: b, status: billDue(b, today).status })),
    upcoming,
    currentMinor: current,
    since: recent[from]!.periodStart,
    /** Every bill so far at this price. */
    unchanged: from === 0,
    wasMinor: from > 0 ? recent[from - 1]!.amountMinor : null,
  };
}
