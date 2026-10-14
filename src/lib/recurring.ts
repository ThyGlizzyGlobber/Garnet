import { and, eq } from 'drizzle-orm';
import { getDb, type Db } from '@/db/client';
import { bill, service, type Bill, type Service } from '@/db/schema';
import { createBill } from '@/lib/bills';
import { listHouseholds } from '@/lib/households';
import { addDays, daysBetween, daysInclusive, todayIn } from '@/lib/dates';
import { addCalendarMonths, MONTHS_PER_BILL } from '@/lib/cadence';
import { listServices, type ServiceWithType } from '@/lib/services';

/**
 * Recurring services (a subscription, rent, a gym): the same charge is
 * expected every cadence at the latest bill's price. The next one is shown
 * as upcoming; once its date passes with no bill in, the app records it as
 * an assumed bill (split and counted like any other), and when the real bill
 * arrives it takes the assumed one's place, price and all (createBill).
 */

/** A charge the app expects: the next one after the latest bill. */
export interface ExpectedCharge {
  serviceId: string;
  periodStart: string;
  periodEnd: string;
  dueDate: string;
  amountMinor: number;
}

type RecurringFields = Pick<
  Service,
  'id' | 'recurringSince' | 'isActive' | 'cancelledAt' | 'cadence'
> &
  Partial<
    Pick<
      Service,
      'recurringPriceMinor' | 'recurringPriceFrom' | 'expectedAmountMinor' | 'expectedOn'
    >
  >;

/** Recurring and still going: switched on, active, not cancelled, with a cadence to follow. */
export function isRecurring(svc: RecurringFields): boolean {
  return !!svc.recurringSince && svc.isActive && !svc.cancelledAt && svc.cadence !== 'irregular';
}

type ChargeBill = Pick<Bill, 'amountMinor' | 'periodStart' | 'periodEnd' | 'dueDate'>;

const STEP_DAYS: Partial<Record<Service['cadence'], number>> = { weekly: 7, fortnightly: 14 };

/**
 * The price of the charge due on `due`, after one due on `prevDue` at
 * `prevMinor`: the price set by hand once its day is reached (the step over
 * `recurringPriceFrom`), else the same as before. A bill on or after that day
 * carries its own price on, so a real bill at another price still wins.
 */
export function priceAfter(
  svc: RecurringFields,
  prevDue: string,
  prevMinor: number,
  due: string,
): number {
  const set = svc.recurringPriceMinor;
  const from = svc.recurringPriceFrom;
  return set && from && prevDue < from && due >= from ? set : prevMinor;
}

/** The charge after this one, at its price (see billAfter, priceAfter). */
function chargeAfter(svc: RecurringFields, b: ChargeBill): ExpectedCharge | null {
  const next = billAfter(svc.cadence, b);
  return (
    next && {
      serviceId: svc.id,
      ...next,
      amountMinor: priceAfter(svc, b.dueDate, b.amountMinor, next.dueDate),
    }
  );
}

/**
 * The first charge of a service with no bill yet, when someone said what it
 * costs and when it falls (on its page, or on Budget): a charge on that day.
 */
function firstCharge(svc: RecurringFields): ExpectedCharge | null {
  const on = svc.expectedOn;
  if (!svc.expectedAmountMinor || !on) return null;
  return {
    serviceId: svc.id,
    periodStart: on,
    periodEnd: on,
    dueDate: on,
    amountMinor: svc.expectedAmountMinor,
  };
}

/**
 * The bill after this one, by its cadence: the same day a cadence later
 * (5 Sep → 5 Oct), with the same shape of period (a whole month, or a single
 * day for a car service or a one-off donation) and its due date as far into
 * the period. Null for irregular bills.
 */
export function billAfter(
  cadence: Service['cadence'],
  b: ChargeBill,
): { periodStart: string; periodEnd: string; dueDate: string } | null {
  const months = MONTHS_PER_BILL[cadence];
  const days = STEP_DAYS[cadence];
  if (!months && !days) return null;
  const step = (d: string) => (months ? addCalendarMonths(d, months) : addDays(d, days!));
  const periodStart = step(b.periodStart);
  // A whole period runs up to the next one; anything shorter keeps its length.
  const whole = addDays(step(b.periodStart), -1) === b.periodEnd;
  const periodEnd = whole
    ? addDays(step(periodStart), -1)
    : addDays(periodStart, daysInclusive(b.periodStart, b.periodEnd) - 1);
  const dueDate = addDays(periodStart, Math.max(0, daysBetween(b.periodStart, b.dueDate)));
  return { periodStart, periodEnd, dueDate };
}

/** The latest of a service's bills, by the period it covers. */
function latestOf<B extends ChargeBill>(bills: B[]): B | undefined {
  return bills.reduce<B | undefined>(
    (latest, b) => (!latest || b.periodStart > latest.periodStart ? b : latest),
    undefined,
  );
}

/**
 * The next charge of a recurring service, at the latest bill's price (so a
 * price rise on the latest bill carries forward). Null when it isn't
 * recurring or has no bill to go from.
 */
export function upcomingCharge(
  svc: RecurringFields,
  bills: (ChargeBill & { paymentPlan?: Bill['paymentPlan'] })[],
): ExpectedCharge | null {
  if (!isRecurring(svc)) return null;
  const latest = latestOf(bills);
  // A bill paid by instalments isn't one repeating price.
  if (latest?.paymentPlan === 'instalments') return null;
  // Charges due before it was made recurring are never assumed, so the next
  // one is the first on or after that day.
  const since = svc.recurringSince!.slice(0, 10);
  let next = latest ? chargeAfter(svc, latest) : firstCharge(svc);
  for (let i = 0; next && next.dueDate < since && i < 520; i++) next = chargeAfter(svc, next);
  return next;
}

/** Switch a service's recurring charge on (from now) or off. */
export function setRecurring(
  householdId: string,
  serviceId: string,
  on: boolean,
  db: Db = getDb(),
): void {
  db.update(service)
    .set({
      recurringSince: on ? new Date().toISOString() : null,
      updatedAt: new Date().toISOString(),
    })
    .where(and(eq(service.householdId, householdId), eq(service.id, serviceId)))
    .run();
}

/**
 * Record each recurring service's charges whose date has come with no bill
 * in, as assumed bills at the latest price. Charges due before the service
 * was made recurring are skipped, never back-filled. Runs on the worker's
 * 15-minute tick; returns how many it recorded.
 */
export function recordRecurringCharges(now = new Date(), db: Db = getDb()): number {
  let recorded = 0;
  for (const hh of listHouseholds(db)) {
    const today = todayIn(hh.timezone, now);
    for (const svc of listServices(hh.id, { everyone: true }, db).filter(isRecurring)) {
      const since = svc.recurringSince!.slice(0, 10);
      const bills = db.select().from(bill).where(eq(bill.serviceId, svc.id)).all();
      const latest = latestOf(bills);
      if (latest?.paymentPlan === 'instalments') continue;
      let next = latest ? chargeAfter(svc, latest) : firstCharge(svc);
      // At most two years of charges at once (a long outage); usually one.
      for (let i = 0; i < 24; i++) {
        if (!next || next.dueDate > today) break;
        if (next.dueDate >= since) {
          createBill(
            hh.id,
            {
              serviceId: svc.id,
              amountMinor: next.amountMinor,
              periodStart: next.periodStart,
              periodEnd: next.periodEnd,
              issueDate: next.periodStart,
              dueDate: next.dueDate,
              source: 'recurring',
              assumed: true,
            },
            db,
          );
          recorded++;
        }
        next = chargeAfter(svc, next);
      }
    }
  }
  return recorded;
}

/**
 * A recurring service's price change: its latest bill against the one
 * before, when they differ by more than 1% ("$22.99 → $24.99"). Null otherwise.
 */
export function priceChange(
  svc: RecurringFields,
  bills: (ChargeBill & { id: string })[],
): { billId: string; fromMinor: number; toMinor: number } | null {
  if (!svc.recurringSince) return null;
  const [latest, previous] = [...bills].sort((a, b) => b.periodStart.localeCompare(a.periodStart));
  if (!latest || !previous) return null;
  const diff = latest.amountMinor - previous.amountMinor;
  if (Math.abs(diff) <= Math.max(previous.amountMinor, 1) * 0.01) return null;
  return { billId: latest.id, fromMinor: previous.amountMinor, toMinor: latest.amountMinor };
}

/**
 * The due dates of a recurring service's next `n` charges, for choosing when
 * a new price starts. Empty when nothing is expected.
 */
export function nextChargeDates(
  svc: RecurringFields,
  bills: (ChargeBill & { paymentPlan?: Bill['paymentPlan'] })[],
  n = 6,
): string[] {
  const out: string[] = [];
  let next = upcomingCharge(svc, bills);
  while (next && out.length < n) {
    out.push(next.dueDate);
    next = chargeAfter(svc, next);
  }
  return out;
}

/**
 * Change what a service's regular charge costs (owner, 2026-10-14). With
 * bills in, charges due on or after `from` cost `amountMinor` (see
 * priceAfter); with none yet, it's the first charge's amount and day
 * (`expected_amount_minor`/`expected_on`, as a bill added on Budget).
 */
export function setChargeAmount(
  householdId: string,
  serviceId: string,
  amountMinor: number,
  from: string,
  db: Db = getDb(),
): void {
  const hasBills = !!db
    .select({ id: bill.id })
    .from(bill)
    .where(and(eq(bill.householdId, householdId), eq(bill.serviceId, serviceId)))
    .get();
  db.update(service)
    .set({
      ...(hasBills
        ? { recurringPriceMinor: amountMinor, recurringPriceFrom: from }
        : { expectedAmountMinor: amountMinor, expectedOn: from }),
      updatedAt: new Date().toISOString(),
    })
    .where(and(eq(service.householdId, householdId), eq(service.id, serviceId)))
    .run();
}

/** Everything a service's page needs about its recurring charge. */
export function recurringView(
  svc: ServiceWithType,
  bills: (ChargeBill & { id: string; paymentPlan?: Bill['paymentPlan'] })[],
) {
  return {
    on: isRecurring(svc),
    upcoming: upcomingCharge(svc, bills),
    priceChange: priceChange(svc, bills),
    chargeDates: nextChargeDates(svc, bills),
    /** A new price set by hand that starts after the next charge ("$24.99 from 5 Dec"). */
    setPrice: pendingPrice(svc, bills),
  };
}

/** A price set by hand that no bill has reached yet, when it isn't already the next charge's. */
function pendingPrice(
  svc: RecurringFields,
  bills: ChargeBill[],
): { amountMinor: number; from: string } | null {
  const set = svc.recurringPriceMinor;
  const from = svc.recurringPriceFrom;
  if (!isRecurring(svc) || !set || !from) return null;
  if (bills.some((b) => b.dueDate >= from)) return null;
  return { amountMinor: set, from };
}
