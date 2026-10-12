import type { Bill, Cadence, Service } from '@/db/schema';
import { costPerDay, mean } from '@/lib/averages';
import { addDays, daysInclusive, overlapDays } from '@/lib/dates';
import { fixedPrice } from '@/lib/cadence';
import { billAfter, upcomingCharge } from '@/lib/recurring';

/**
 * The one rule for the bills a service is expected to send next (owner,
 * 2026-10-01: a car service or a rates notice is one payment, never spread
 * over the months). Every figure that looks ahead uses it: Home's month and
 * forecast, set aside, the Services page, the year ahead, a service's page.
 *
 * Each expected bill is a whole bill, due on a day, at an amount worked out
 * the way that kind of bill is priced:
 *  - a recurring charge, or bills that all cost the same: that price;
 *  - bills priced by use (electricity, gas, water): what the same days cost
 *    last year, moved by how recent bills compare with the ones before last
 *    year's; else normal weather or the area's typical cost when the page has
 *    them; else the recent bills' cost per day; times the days it covers;
 *  - anything else (rego, insurance, servicing, a cleaner): the latest price
 *    for yearly bills, else the average of the last three.
 * Irregular bills have no next date, so nothing is expected of them.
 *  - a bill added by hand on Budget before any has arrived (its usual amount
 *    and roughly when): that amount on that day, then every cadence after,
 *    until a real bill comes in and takes over.
 */

export type ExpectedBasis =
  | 'recurring'
  | 'fixed'
  | 'lastYear'
  | 'weather'
  | 'area'
  | 'recent'
  | 'latest'
  | 'single'
  /** A bill added by hand on Budget, before any bill has arrived (quick-add). */
  | 'added';

export interface ExpectedBill {
  serviceId: string;
  periodStart: string;
  periodEnd: string;
  dueDate: string;
  amountMinor: number;
  basis: ExpectedBasis;
}

type ServiceFields = Pick<
  Service,
  'id' | 'isActive' | 'cancelledAt' | 'cadence' | 'usageUnit' | 'seasonal' | 'recurringSince'
> &
  Partial<Pick<Service, 'expectedAmountMinor' | 'expectedOn'>>;
type BillFields = Pick<Bill, 'amountMinor' | 'periodStart' | 'periodEnd' | 'dueDate'> & {
  paymentPlan?: Bill['paymentPlan'];
};

/** A cost per day for a period from elsewhere (normal weather, the area), when the page has one. */
export type PerDayFallback = (
  start: string,
  end: string,
  billCount: number,
) => { perDay: number; basis: 'weather' | 'area' } | null;

/** Bills priced by what's used (electricity, gas, water): their cost follows the days and the season. */
const pricedByUse = (svc: Pick<Service, 'usageUnit' | 'seasonal'>): boolean =>
  !!svc.usageUnit || svc.seasonal;

/** A bill covering fewer days than this is a charge on a day (a service, a donation), not a period of use. */
const CHARGE_DAYS = 7;

const byStart = <B extends BillFields>(bills: B[]) =>
  [...bills].sort((a, b) => a.periodStart.localeCompare(b.periodStart));

/**
 * What the same days cost a year earlier, per day, from the bills that
 * covered them (at least 60% of the days), moved by how the latest three
 * bills compare with the three before those (0.8–1.25). Null without them.
 */
function lastYearPerDay(sorted: BillFields[], start: string, end: string): number | null {
  const from = addDays(start, -365);
  const to = addDays(end, -365);
  const days = daysInclusive(from, to);
  let covered = 0;
  let cost = 0;
  const used: BillFields[] = [];
  for (const b of sorted) {
    const overlap = overlapDays(b.periodStart, b.periodEnd, from, to);
    if (overlap <= 0) continue;
    covered += overlap;
    cost += costPerDay(b) * overlap;
    used.push(b);
  }
  if (!covered || covered < days * 0.6) return null;
  const recent = sorted.slice(-3);
  const first = sorted.indexOf(used[0]!);
  const before = sorted.slice(Math.max(0, first - 3), first);
  const drift =
    before.length && !recent.some((b) => used.includes(b))
      ? mean(recent.map(costPerDay)) / mean(before.map(costPerDay))
      : 1;
  return (cost / covered) * Math.min(1.25, Math.max(0.8, drift || 1));
}

/** Within 1% of each other: the same price. */
const samePrice = (a: number, b: number) => Math.abs(a - b) <= Math.max(a, b) * 0.01;

/**
 * The price of the next bill of a service not priced by use. Prices like
 * these move in steps (a new rego fee, a dearer plan), so the latest price
 * stands when it's a price at all: a yearly bill, a price paid twice running,
 * or a change after a steady run. Bills that keep varying (a cleaner's hours)
 * are the average of the last three.
 */
function nextPrice(
  cadence: Cadence,
  sorted: BillFields[],
): { minor: number; basis: ExpectedBasis } {
  const latest = sorted.at(-1)!.amountMinor;
  if (sorted.length === 1) return { minor: latest, basis: 'single' };
  const [a, b] = sorted.slice(-3, -1).map((x) => x.amountMinor);
  const before = sorted.at(-2)!.amountMinor;
  const steady = sorted.length >= 3 && a !== undefined && b !== undefined && samePrice(a, b);
  if (cadence === 'annual' || samePrice(latest, before) || steady)
    return { minor: latest, basis: 'latest' };
  return { minor: Math.round(mean(sorted.slice(-3).map((x) => x.amountMinor))), basis: 'recent' };
}

/**
 * A service's bills expected after its latest one, due up to the end of
 * `untilMonth` ("2027-09"), each at the amount its kind of bill is priced at
 * (see the rule above). Its first may be due before today: a bill that
 * hasn't come in yet. Empty when the service is stopped, cancelled or
 * irregular, or has no bill to go from.
 */
export function expectedBills(
  svc: ServiceFields,
  bills: BillFields[],
  untilMonth: string,
  fallback?: PerDayFallback,
): ExpectedBill[] {
  if (!svc.isActive || svc.cancelledAt || svc.cadence === 'irregular') return [];
  if (!bills.length) return addedByHand(svc, untilMonth);
  const sorted = byStart(bills);
  const latest = sorted.at(-1)!;
  const charges = daysInclusive(latest.periodStart, latest.periodEnd) < CHARGE_DAYS;
  const byUse = pricedByUse(svc) && !charges;
  const fixed = fixedPrice(sorted);
  const price = byUse ? null : nextPrice(svc.cadence, sorted);
  const recentPerDay = mean(sorted.slice(-3).map(costPerDay));

  const amountFor = (start: string, end: string): { minor: number; basis: ExpectedBasis } => {
    if (fixed !== null) return { minor: fixed, basis: 'fixed' };
    if (price) return price;
    const days = daysInclusive(start, end);
    const ly = lastYearPerDay(sorted, start, end);
    if (ly !== null) return { minor: Math.round(ly * days), basis: 'lastYear' };
    const other = fallback?.(start, end, sorted.length);
    if (other) return { minor: Math.round(other.perDay * days), basis: other.basis };
    return {
      minor: Math.round(recentPerDay * days),
      basis: sorted.length === 1 ? 'single' : 'recent',
    };
  };

  const out: ExpectedBill[] = [];
  // A recurring charge is expected at its latest price, from its own date.
  const charge = upcomingCharge(svc, sorted);
  let from: BillFields = latest;
  for (let i = 0; i < 120; i++) {
    const next = i === 0 && charge ? charge : billAfter(svc.cadence, from);
    if (!next || next.dueDate.slice(0, 7) > untilMonth) break;
    const amount = charge
      ? { minor: charge.amountMinor, basis: 'recurring' as const }
      : amountFor(next.periodStart, next.periodEnd);
    out.push({
      serviceId: svc.id,
      periodStart: next.periodStart,
      periodEnd: next.periodEnd,
      dueDate: next.dueDate,
      amountMinor: amount.minor,
      basis: amount.basis,
    });
    from = { ...next, amountMinor: amount.minor };
  }
  return out;
}

/**
 * A service with no bills yet, added by hand on Budget with its usual amount
 * and roughly when it falls: that bill on that day (a charge on the day),
 * then one every cadence, up to the end of `untilMonth`.
 */
function addedByHand(svc: ServiceFields, untilMonth: string): ExpectedBill[] {
  const amount = svc.expectedAmountMinor ?? null;
  const on = svc.expectedOn ?? null;
  if (!amount || !on) return [];
  const out: ExpectedBill[] = [];
  let next: { periodStart: string; periodEnd: string; dueDate: string } | null = {
    periodStart: on,
    periodEnd: on,
    dueDate: on,
  };
  for (let i = 0; i < 120 && next; i++) {
    if (next.dueDate.slice(0, 7) > untilMonth) break;
    out.push({ serviceId: svc.id, ...next, amountMinor: amount, basis: 'added' });
    next = billAfter(svc.cadence, { ...next, amountMinor: amount });
  }
  return out;
}

/** The next bill a service is expected to send (see expectedBills), or null. */
export function nextExpected(
  svc: ServiceFields,
  bills: BillFields[],
  fallback?: PerDayFallback,
): ExpectedBill | null {
  const first = expectedBills(svc, bills, '9999-12', fallback)[0];
  return first ?? null;
}

/**
 * What a service's bill costs when it comes, and how often: "$733 each
 * time", "$825 a year", "$59 a month". A bill that always costs the same is
 * that price; one priced by use is the average of the last year's bills
 * (else the recent ones); anything else its next price (see nextPrice).
 * `everyMonths` is how far apart irregular bills usually are. Null before
 * its first bill.
 */
export interface EachBill {
  amountMinor: number;
  cadence: Cadence;
  /** The same every time (a fixed price or a recurring charge). */
  exact: boolean;
  everyMonths: number | null;
}

export function eachBill(
  svc: Pick<Service, 'cadence' | 'usageUnit' | 'seasonal'>,
  bills: BillFields[],
  today: string,
): EachBill | null {
  if (!bills.length) return null;
  const sorted = byStart(bills);
  const fixed = fixedPrice(sorted);
  const yearAgo = addDays(today, -365);
  const year = sorted.filter((b) => b.dueDate > yearAgo);
  const amountMinor =
    fixed ??
    (pricedByUse(svc)
      ? Math.round(mean((year.length ? year : sorted.slice(-3)).map((b) => b.amountMinor)))
      : nextPrice(svc.cadence, sorted).minor);
  let everyMonths: number | null = null;
  if (svc.cadence === 'irregular' && sorted.length >= 2) {
    const gaps = sorted
      .slice(1)
      .map((b, i) => daysInclusive(sorted[i]!.periodStart, b.periodStart) - 1)
      .sort((a, b) => a - b);
    everyMonths = Math.max(1, Math.round(gaps[Math.floor(gaps.length / 2)]! / (365 / 12)));
  }
  return { amountMinor, cadence: svc.cadence, exact: fixed !== null, everyMonths };
}

/** How many bills a year a service sends at this rate (an irregular one, by its usual gap). */
export function billsAYear(each: Pick<EachBill, 'cadence' | 'everyMonths'>): number {
  const perYear: Record<Cadence, number> = {
    weekly: 52,
    fortnightly: 26,
    monthly: 12,
    bimonthly: 6,
    quarterly: 4,
    annual: 1,
    irregular: 0,
  };
  return each.cadence === 'irregular'
    ? each.everyMonths
      ? 12 / each.everyMonths
      : 1
    : perYear[each.cadence];
}
