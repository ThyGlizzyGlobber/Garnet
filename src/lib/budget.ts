import { and, eq } from 'drizzle-orm';
import { getDb, type Db } from '@/db/client';
import { householdBudget, type Household, type Member } from '@/db/schema';
import { listBills } from '@/lib/bills';
import { expectedBills } from '@/lib/expected';
import { dueParts } from '@/lib/instalments';
import { addMonths, fiscalYearBounds, monthBounds } from '@/lib/periods';
import { perDayFallback } from '@/lib/projections';
import { isEssential } from '@/lib/service-categories';
import { listServices, type ServiceWithType } from '@/lib/services';

/**
 * The Budget page (SCOPE-redesign-2.md §5): one question, "have I budgeted
 * enough for the year's bills?" The year is the household's financial year
 * (fiscal_year_start_month, 1 July in Australia) or the calendar year when it
 * starts in January; there is no rolling year. Every figure is by due date,
 * bills in full in the month they fall due (owner, 2026-10-01): what has been
 * paid, what is in and still to pay, and what each service is expected to
 * send for the months ahead (src/lib/expected.ts), added up to a projected
 * total. A yearly budget is optional and stored per household and year
 * (household_budget); without one there is no verdict. Pure numbers; the
 * page words them.
 */

type YearBasis = 'fy' | 'calendar';

export interface BudgetMonth {
  month: string;
  /** Bills (and instalments) in and paid to the provider, due this month. */
  paidMinor: number;
  /** In, still to pay. */
  toPayMinor: number;
  /** Expected to arrive (not in yet). */
  expectedMinor: number;
  /** The largest expected bill of the month, for "Includes Building Insurance, about 3 Nov". */
  biggest: { serviceId: string; serviceName: string; amountMinor: number; dueDate: string } | null;
}

export interface BudgetView {
  basis: YearBasis;
  /** "fy-2026" or "cy-2026": the budget row's key. */
  yearKey: string;
  /** The year's start year, as a number. */
  startYear: number;
  start: string;
  end: string;
  months: BudgetMonth[];
  thisMonth: string;
  paidMinor: number;
  paidBills: number;
  toPayMinor: number;
  expectedMinor: number;
  /** Paid, to pay and expected, added up. */
  projectedMinor: number;
  /** Essentials against everything else, of the projected total. */
  split: { essentialsMinor: number; otherMinor: number };
  /** The yearly budget, when one is set. */
  budgetMinor: number | null;
  /** Projected ÷ 12. */
  setAsideMinor: number;
  /** The months ahead that cost the most, in date order. */
  bigAhead: { month: string; totalMinor: number; biggest: BudgetMonth['biggest'] }[];
  /** What the projection rests on. */
  basisInfo: {
    /** Months of this year with a bill in (to this month), and the first and last of them. */
    monthsOfBills: number;
    firstMonth: string | null;
    lastMonth: string | null;
    /** Services billed yearly (or less often than monthly) that something is known about. */
    yearlyBills: number;
    /** Nothing is known about any yearly bill: the total is probably low. */
    probablyLow: boolean;
    /** A full twelve months of history exist before this year (year-on-year comparisons may show). */
    fullHistory: boolean;
  };
}

/** The household's year basis: its financial year, or the calendar year when that starts in January. */
const yearBasis = (hh: Pick<Household, 'fiscalYearStartMonth'>): YearBasis =>
  hh.fiscalYearStartMonth === 1 ? 'calendar' : 'fy';

/** The year `today` falls in, on the household's basis. */
export function budgetYear(
  hh: Pick<Household, 'fiscalYearStartMonth'>,
  today: string,
): { key: string; startYear: number; start: string; end: string; months: string[] } {
  const fy = fiscalYearBounds(today, hh.fiscalYearStartMonth);
  const startYear = Number(fy.start.slice(0, 4));
  const key = `${yearBasis(hh) === 'fy' ? 'fy' : 'cy'}-${startYear}`;
  const first = fy.start.slice(0, 7);
  return {
    key,
    startYear,
    start: fy.start,
    end: fy.end,
    months: Array.from({ length: 12 }, (_, i) => addMonths(first, i)),
  };
}

function getBudget(householdId: string, year: string, db: Db = getDb()): number | null {
  const row = db
    .select()
    .from(householdBudget)
    .where(and(eq(householdBudget.householdId, householdId), eq(householdBudget.year, year)))
    .get();
  return row?.amountMinor ?? null;
}

/** Set (or clear, with null) the yearly budget for one year. */
export function setBudget(
  householdId: string,
  year: string,
  amountMinor: number | null,
  db: Db = getDb(),
): void {
  const where = and(eq(householdBudget.householdId, householdId), eq(householdBudget.year, year));
  if (amountMinor === null) {
    db.delete(householdBudget).where(where).run();
    return;
  }
  const now = new Date().toISOString();
  db.insert(householdBudget)
    .values({ householdId, year, amountMinor, updatedAt: now })
    .onConflictDoUpdate({
      target: [householdBudget.householdId, householdBudget.year],
      set: { amountMinor, updatedAt: now },
    })
    .run();
}

/** Billed less often than monthly: the bills a few months of data can't show. */
const yearly = (svc: Pick<ServiceWithType, 'cadence'>) =>
  svc.cadence === 'annual' || svc.cadence === 'quarterly' || svc.cadence === 'bimonthly';

export function budgetView(hh: Household, me: Member, today: string, db: Db = getDb()): BudgetView {
  const year = budgetYear(hh, today);
  const thisMonth = today.slice(0, 7);
  const bills = listBills(hh.id, { viewer: me.id }, db);
  const services = listServices(hh.id, { viewer: me.id }, db);
  const byMonth = new Map<string, BudgetMonth>(
    year.months.map((m) => [
      m,
      { month: m, paidMinor: 0, toPayMinor: 0, expectedMinor: 0, biggest: null },
    ]),
  );
  const essentialOf = new Map(services.map((s) => [s.id, isEssential(s.type)]));
  const split = { essentialsMinor: 0, otherMinor: 0 };
  const addSplit = (serviceId: string, minor: number) => {
    if (essentialOf.get(serviceId)) split.essentialsMinor += minor;
    else split.otherMinor += minor;
  };

  // What is in: each bill or instalment in full in the month it falls due.
  let paidBills = 0;
  const monthsWithBills = new Set<string>();
  const inYear = (d: string) => d >= year.start && d <= year.end;
  for (const b of bills)
    for (const p of dueParts(b)) {
      if (!inYear(p.dueDate)) continue;
      const row = byMonth.get(p.dueDate.slice(0, 7))!;
      if (p.paidAt) {
        row.paidMinor += p.amountMinor;
        paidBills++;
      } else row.toPayMinor += p.amountMinor;
      addSplit(b.serviceId, p.amountMinor);
      if (p.dueDate.slice(0, 7) <= thisMonth) monthsWithBills.add(p.dueDate.slice(0, 7));
    }

  // What each service is expected to send: this month's late ones and the months ahead.
  const known = new Set(
    bills
      .flatMap((b) => dueParts(b).map((p) => `${b.serviceId}:${p.dueDate.slice(0, 7)}`))
      .filter(Boolean),
  );
  const serviceName = new Map(services.map((s) => [s.id, s.name]));
  let yearlyKnown = 0;
  for (const svc of services) {
    const own = bills.filter((b) => b.serviceId === svc.id);
    if (yearly(svc) && (own.length || (svc.expectedAmountMinor && svc.expectedOn))) yearlyKnown++;
    const expected = expectedBills(
      svc,
      own,
      year.months[11]!,
      perDayFallback(hh.id, svc, today, db),
    ).filter((e) => {
      const m = e.dueDate.slice(0, 7);
      if (!inYear(e.dueDate) || m < thisMonth) return false;
      // A month that already has this service's bill in doesn't expect another of it.
      return !known.has(`${svc.id}:${m}`);
    });
    for (const e of expected) {
      const row = byMonth.get(e.dueDate.slice(0, 7))!;
      row.expectedMinor += e.amountMinor;
      addSplit(svc.id, e.amountMinor);
      if (!row.biggest || e.amountMinor > row.biggest.amountMinor)
        row.biggest = {
          serviceId: svc.id,
          serviceName: serviceName.get(svc.id) ?? '',
          amountMinor: e.amountMinor,
          dueDate: e.dueDate,
        };
    }
  }

  const months = [...byMonth.values()];
  const sum = (f: (m: BudgetMonth) => number) => months.reduce((s, m) => s + f(m), 0);
  const paidMinor = sum((m) => m.paidMinor);
  const toPayMinor = sum((m) => m.toPayMinor);
  const expectedMinor = sum((m) => m.expectedMinor);
  const projectedMinor = paidMinor + toPayMinor + expectedMinor;
  const ahead = months
    .filter((m) => m.month > thisMonth)
    .map((m) => ({
      month: m.month,
      totalMinor: m.toPayMinor + m.expectedMinor,
      biggest: m.biggest,
    }))
    .filter((m) => m.totalMinor > 0);
  const bigAhead = [...ahead]
    .sort((a, b) => b.totalMinor - a.totalMinor)
    .slice(0, 3)
    .sort((a, b) => a.month.localeCompare(b.month));
  const had = [...monthsWithBills].sort();
  // A full year before this one: twelve months with a bill due in each.
  const before = new Set(
    bills
      .flatMap((b) => dueParts(b).map((p) => p.dueDate))
      .filter((d) => d < year.start && d >= monthBounds(addMonths(year.months[0]!, -12)).start)
      .map((d) => d.slice(0, 7)),
  );
  return {
    basis: yearBasis(hh),
    yearKey: year.key,
    startYear: year.startYear,
    start: year.start,
    end: year.end,
    months,
    thisMonth,
    paidMinor,
    paidBills,
    toPayMinor,
    expectedMinor,
    projectedMinor,
    split,
    budgetMinor: getBudget(hh.id, year.key, db),
    setAsideMinor: Math.round(projectedMinor / 12),
    bigAhead,
    basisInfo: {
      monthsOfBills: had.length,
      firstMonth: had[0] ?? null,
      lastMonth: had.at(-1) ?? null,
      yearlyBills: yearlyKnown,
      probablyLow: yearlyKnown === 0,
      fullHistory: before.size >= 12,
    },
  };
}
