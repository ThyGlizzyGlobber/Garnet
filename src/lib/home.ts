import { getDb, type Db } from '@/db/client';
import { SAME_BAND } from '@/lib/averages';
import type { Household, Member } from '@/db/schema';
import { billsWithAlerts, getBill, listBills } from '@/lib/bills';
import { householdUsage } from '@/lib/consumption';
import { canChoosePlan, dueNow, fullPaymentOpen, planUndecided } from '@/lib/instalments';
import { hasHousemates } from '@/lib/members';
import { ownershipQuestions } from '@/lib/ownership';
import { addMonths } from '@/lib/periods';
import { nextMonth, projectMonth, type ProjectionMethod } from '@/lib/projections';
import { latestRegionalChoice, regionalEnabled } from '@/lib/regional';
import { remindersFor, summariseReminders } from '@/lib/reminders';
import { documentCounts } from '@/lib/review';
import { isAdmin } from '@/lib/roles';
import { seasonAhead } from '@/lib/seasons';
import { listServices } from '@/lib/services';
import {
  dashboardSummary,
  hasAnyBills,
  householdBalances,
  memberLedger,
  settlementRate,
} from '@/lib/stats';
import { weatherWeek } from '@/lib/weather-week';

/** So far this month, as a percentage of the month's estimate. */
const budgetPct = (soFar: number, estimate: number) =>
  estimate > 0 ? Math.round((soFar / estimate) * 100) : 0;

/** The strongest basis an estimate can have, first; the set-aside note names the best one used. */
const METHOD_STRENGTH: ProjectionMethod[] = ['seasonal', 'weather', 'recent', 'area', 'single'];

/**
 * Everything the Home screen shows for the household, worked out here so the
 * page only formats and lays it out. Null fields are tiles that don't apply
 * (a household that doesn't split bills has no shares; no bills yet, and so on).
 */
export function homeView(
  hh: Household,
  me: Member,
  today: string,
  opts: { postcodePromptDismissed: boolean },
  db: Db = getDb(),
) {
  const shared = hh.splitMode === 'shared';
  if (!hasAnyBills(hh.id, db))
    return { empty: { hasServices: listServices(hh.id, {}, db).length > 0 } } as const;

  const s = dashboardSummary(hh.id, today, hh.fiscalYearStartMonth, db);
  const month = s.thisMonth.month;
  const projected = projectMonth(hh.id, month, db);
  const next = projectMonth(hh.id, nextMonth(today), db);
  const forecast = Array.from({ length: 6 }, (_, i) =>
    projectMonth(hh.id, addMonths(month, i + 1), db),
  );
  const change = (from: number | null) => (from ? (s.thisMonth.total - from) / from : null);

  // The next bill to pay and, paid by instalments, the instalment due now.
  const nextBill = s.overdue[0] ?? s.upcoming[0] ?? null;
  const nextDetail = nextBill ? getBill(hh.id, nextBill.id, db) : null;
  const nextDue = nextBill ? dueNow(nextBill) : null;
  const myShare =
    nextDetail?.shares.find(
      (sh) => sh.memberId === me.id && sh.instalment === (nextDue?.seq ?? 0),
    ) ?? null;

  const ledger = shared ? memberLedger(hh.id, me.id, today, hh.fiscalYearStartMonth, db) : null;
  const services = new Map(listServices(hh.id, {}, db).map((svc) => [svc.id, svc]));
  const serviceNames = new Map(s.services.map((svc) => [svc.id, svc.name]));

  return {
    empty: null,
    shared,
    housemates: hasHousemates(hh.id, db),
    summary: s,
    month: {
      month,
      totalMinor: s.thisMonth.total,
      /** Change on last month and on the same month last year (fractions), or null. */
      vsLastMonth: change(s.lastMonthTotal),
      vsLastYear: change(s.sameMonthLastYearTotal),
      level: (() => {
        const d = change(s.lastMonthTotal);
        return d === null ? null : Math.abs(d) < SAME_BAND ? 'level' : d > 0 ? 'up' : 'down';
      })(),
      projectedMinor: projected.totalMinor,
      /** So far this month, as a percentage of the month's estimate. */
      budgetPct: budgetPct(s.thisMonth.total, projected.totalMinor),
    },
    share: ledger && {
      owed: ledger.owed,
      owedToMe: ledger.owedToMe,
      unpaidCount: ledger.unpaid.length,
      paidPct:
        ledger.totalThisFy > 0 ? Math.round((ledger.paidThisFy / ledger.totalThisFy) * 100) : 0,
    },
    perPersonPerDay: s.costPerPersonPerDay,
    forecast: {
      months: forecast.map((f) => ({ month: f.month, totalMinor: f.totalMinor })),
      nextMonth: next.month,
      setAsideEach: next.setAsideEach,
      setAsideTotal: next.totalMinor,
      method: METHOD_STRENGTH.find((m) => next.services.some((p) => p.method === m)) ?? 'none',
    },
    /** Twelve months of cost, each with its three biggest services. */
    chart: s.series.map((r) => ({
      month: r.month,
      totalMinor: r.total,
      top: Object.entries(r.byService)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([id, minor]) => ({ name: serviceNames.get(id) ?? '?', minor })),
    })),
    nextDue:
      nextBill && nextDue
        ? { bill: nextBill, due: nextDue, myShare, overdue: nextBill.daysUntilDue < 0 }
        : null,
    upcoming: {
      bills: [...s.overdue, ...s.upcoming].slice(0, 5).map((b) => ({ ...b, due: dueNow(b) })),
      count: s.overdue.length + s.upcoming.length,
    },
    balances: shared ? householdBalances(hh.id, db, today) : [],
    settled: shared ? settlementRate(hh.id, month, db) : null,
    ranking: s.fiscalYear.byService,
    anomalies: s.anomalies,
    banners: {
      // Household bills with a problem, and the viewer's own personal ones.
      alerts: billsWithAlerts(hh.id, { viewer: me.id }, db),
      // "Who's this for?": services set up from bills this member brought in.
      whose: hasHousemates(hh.id, db) ? ownershipQuestions(hh.id, me, db) : [],
      // Bills offering instalments that nobody has chosen a plan for.
      plans: listBills(hh.id, { viewer: me.id }, db)
        .filter((b) => planUndecided(b) && !b.paidToProviderAt && canChoosePlan(me, b))
        .map((b) => ({ bill: b, fullStillOpen: fullPaymentOpen(b, today) })),
      waitingInInbox: documentCounts(hh.id, db).needs_review,
      myReminders: shared ? summariseReminders(remindersFor(hh.id, me.id, today, 7, db)) : null,
    },
    notices: {
      // Households from before area comparisons: tell an admin once that it's on.
      sharing:
        isAdmin(me) &&
        !hh.isDemo &&
        hh.shareRegional &&
        regionalEnabled() &&
        !latestRegionalChoice(hh.id, db),
      askForPostcode: isAdmin(me) && !hh.isDemo && !hh.postalCode && !opts.postcodePromptDismissed,
    },
    weather: weatherWeek(hh.id, today, db),
    seasons: seasonAhead(hh.id, today, db),
    usage: householdUsage(hh.id, db).flatMap((u) => {
      const svc = services.get(u.serviceId);
      return svc && u.latest.perDay !== null
        ? [{ ...u, service: svc, perDay: u.latest.perDay }]
        : [];
    }),
  };
}

export type HomeView = Exclude<ReturnType<typeof homeView>, { empty: { hasServices: boolean } }>;

/**
 * The wall display's numbers (the kiosk on the iPad): a leaner Home for the
 * whole household, refreshed every minute. Null before the first bill.
 */
export function wallView(hh: Household, today: string, db: Db = getDb()) {
  if (!hasAnyBills(hh.id, db)) return null;
  const shared = hh.splitMode === 'shared';
  const s = dashboardSummary(hh.id, today, hh.fiscalYearStartMonth, db);
  const projected = projectMonth(hh.id, s.thisMonth.month, db);
  const next = projectMonth(hh.id, nextMonth(today), db);
  const nextBill = s.overdue[0] ?? s.upcoming[0] ?? null;
  return {
    shared,
    summary: s,
    budgetPct: budgetPct(s.thisMonth.total, projected.totalMinor),
    nextDue: nextBill
      ? { bill: nextBill, due: dueNow(nextBill), overdue: nextBill.daysUntilDue < 0 }
      : null,
    balances: shared ? householdBalances(hh.id, db, today) : [],
    settled: shared ? settlementRate(hh.id, s.thisMonth.month, db) : null,
    setAside: { month: next.month, each: next.setAsideEach },
  };
}
