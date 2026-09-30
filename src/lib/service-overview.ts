import { getDb, type Db } from '@/db/client';
import type { Household } from '@/db/schema';
import { costPerDay } from '@/lib/averages';
import { billDue } from '@/lib/bill-status';
import { listBills, type BillListItem } from '@/lib/bills';
import { compareUsage, usageHistory, type Change } from '@/lib/consumption';
import { daysInclusive } from '@/lib/dates';
import { addMonths, fiscalYearBounds } from '@/lib/periods';
import { estimatePerDay, nextBillGuess, projectMonth } from '@/lib/projections';
import { areaComparison } from '@/lib/regional';
import { seasonAhead } from '@/lib/seasons';
import type { ServiceWithType } from '@/lib/services';
import { splitView } from '@/lib/split-view';
import { weatherAdjusted } from '@/lib/weather-model';

const changeOf = (from: number, to: number): Change => ({
  from,
  to,
  pct: from ? (to - from) / from : null,
});

/** The part of a bill's cost that falls inside [start, end], pro-rata by days. */
function accrued(b: BillListItem, start: string, end: string): number {
  const s = b.periodStart > start ? b.periodStart : start;
  const e = b.periodEnd < end ? b.periodEnd : end;
  if (e < s) return 0;
  return Math.round(
    (b.amountMinor * daysInclusive(s, e)) / daysInclusive(b.periodStart, b.periodEnd),
  );
}

/** One bar on the service page's chart: a bill's period and its usage (or cost) per day. */
export interface ServiceBar {
  billId: string;
  periodStart: string;
  periodEnd: string;
  /** Usage per day in the service's unit, or cost per day in minor units. */
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
  const inFy = (fy: { start: string; end: string }) =>
    bills.filter((b) => b.periodEnd >= fy.start && b.periodStart <= fy.end);
  const year = inFy(lastFy).length ? { ...lastFy, current: false } : { ...thisFy, current: true };
  const yearEnd = year.end > today ? today : year.end;
  const yearBills = inFy(year);
  const yearMinor = yearBills.reduce((s, b) => s + accrued(b, year.start, yearEnd), 0);
  const yearMonths = Math.max(1, daysInclusive(year.start, yearEnd) / (365 / 12));

  const est = estimatePerDay(bills, today.slice(0, 7));
  const guess = svc.cadence === 'irregular' ? null : nextBillGuess(latest, svc.cadence, est.perDay);
  const unit = history?.unit ?? svc.usageUnit;
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
        perMonthMinor: Math.round(yearMinor / yearMonths),
      },
      latest: latest
        ? {
            billId: latest.id,
            amountMinor: billDue(latest, today).amountMinor,
            status: billDue(latest, today).status,
          }
        : null,
      next: guess
        ? { amountMinor: guess.amountMinor, dueDate: guess.dueDate, method: est.method }
        : null,
    },
    /** Each bill, oldest first, as a bar: usage per day when the service has usage, else cost per day. */
    bars: [...bills].reverse().map((b): ServiceBar => ({
      billId: b.id,
      periodStart: b.periodStart,
      periodEnd: b.periodEnd,
      value: unit && usageOf.get(b.id) != null ? usageOf.get(b.id)! : costPerDay(b),
      amountMinor: b.amountMinor,
      usage: usageOf.get(b.id) ?? null,
      unusual: b.isAnomaly,
    })),
    /** Bars measure usage per day (true) or cost per day (false). */
    barsAreUsage: !!unit && (history?.periods ?? []).some((p) => p.perDay !== null),
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
    comingUp: [0, 1, 2].flatMap((i) => {
      const month = addMonths(today.slice(0, 7), i);
      const p = projectMonth(hh.id, month, db).services.find((x) => x.service.id === svc.id);
      return p && p.method !== 'none' ? [{ month, minor: p.monthMinor, method: p.method }] : [];
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
