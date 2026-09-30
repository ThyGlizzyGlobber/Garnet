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
>;

/** Recurring and still going: switched on, active, not cancelled, with a cadence to follow. */
export function isRecurring(svc: RecurringFields): boolean {
  return !!svc.recurringSince && svc.isActive && !svc.cancelledAt && svc.cadence !== 'irregular';
}

type ChargeBill = Pick<Bill, 'amountMinor' | 'periodStart' | 'periodEnd' | 'dueDate'>;

const STEP_DAYS: Partial<Record<Service['cadence'], number>> = { weekly: 7, fortnightly: 14 };

/** The charge after this one, at its price (see billAfter). */
function chargeAfter(svc: RecurringFields, b: ChargeBill): ExpectedCharge | null {
  const next = billAfter(svc.cadence, b);
  return next && { serviceId: svc.id, ...next, amountMinor: b.amountMinor };
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
  if (!latest || latest.paymentPlan === 'instalments') return null;
  // Charges due before it was made recurring are never assumed, so the next
  // one is the first on or after that day.
  const since = svc.recurringSince!.slice(0, 10);
  let next = chargeAfter(svc, latest);
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
      let from = latestOf(bills);
      if (!from || from.paymentPlan === 'instalments') continue;
      // At most two years of charges at once (a long outage); usually one.
      for (let i = 0; i < 24; i++) {
        const next = chargeAfter(svc, from);
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
        from = { ...from, ...next };
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

/** Everything a service's page needs about its recurring charge. */
export function recurringView(
  svc: ServiceWithType,
  bills: (ChargeBill & { id: string; paymentPlan?: Bill['paymentPlan'] })[],
) {
  return {
    on: isRecurring(svc),
    upcoming: upcomingCharge(svc, bills),
    priceChange: priceChange(svc, bills),
  };
}
