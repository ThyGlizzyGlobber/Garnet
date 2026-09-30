import type { Household } from '@/db/schema';
import { getDb, type Db } from '@/db/client';
import { SAME_BAND } from '@/lib/averages';
import { paysByInstalments } from '@/lib/instalments';
import { billStatus, type BillStatus } from '@/lib/bill-status';
import { listBills, type BillListItem } from '@/lib/bills';
import { addMonths } from '@/lib/periods';
import { estimatePerDay, fixedPrice, MONTHS_PER_BILL, nextBillGuess } from '@/lib/projections';
import { upcomingCharge } from '@/lib/recurring';
import type { GroupedCategory } from '@/lib/service-categories';
import { groupServices, listServices, type ServiceWithType } from '@/lib/services';

/**
 * The Services page: one month of bills, service by service. Each service
 * says what's due that month (by due date, the month a household pays it;
 * each instalment in its own month), where it stands, and how it compares
 * with the bill before; a service with nothing due that month says when the
 * next is expected, or when it last had a bill due. Main services (Vehicles,
 * Subscriptions…) gather theirs. Pure numbers; the page words them.
 */

export type MonthScope = 'all' | 'household' | 'mine';

export interface MonthItem {
  service: ServiceWithType;
  /** What's due this month (bills, or instalments of one), soonest first. */
  bills: { bill: BillListItem; amountMinor: number; status: BillStatus }[];
  amountMinor: number;
  /** The most pressing of this month's bills (overdue, then due, then paid). */
  status: BillStatus | null;
  /** This month's bill against the one before it: level within 2%, else up or down. */
  change: { dir: 'same' | 'up' | 'down'; pct: number; month: string } | null;
  /** Nothing billed this month yet: the next bill expected (this month or later), and its guess. */
  expected: { dueDate: string; amountMinor: number | null } | null;
  /** Nothing this month and nothing expected: the month it last billed. */
  lastMonth: string | null;
}

export type MonthEntry =
  | { kind: 'service'; item: MonthItem }
  | {
      kind: 'group';
      key: string;
      typeSlug: string | null;
      category: GroupedCategory | null;
      label: string;
      icon: string;
      colour: string;
      items: MonthItem[];
      amountMinor: number;
      status: BillStatus | null;
      /** Of its services, how many have something expected this month. */
      toCome: number;
    };

export interface ServicesMonth {
  month: string;
  prev: string;
  /** Up to next month; null beyond. */
  next: string | null;
  totalMinor: number;
  counts: { bills: number; paid: number; toPay: number; overdue: number; toCome: number };
  entries: MonthEntry[];
}

const RANK: Record<BillStatus['key'], number> = {
  overdue: 0,
  today: 1,
  tomorrow: 2,
  soon: 3,
  due: 4,
  paid: 5,
};
const worst = (xs: (BillStatus | null)[]): BillStatus | null =>
  xs.reduce<BillStatus | null>((w, s) => (s && (!w || RANK[s.key] < RANK[w.key]) ? s : w), null);

/**
 * What a bill has due: the bill itself, or, paid by instalments, each
 * instalment, with its due date and whether it's paid.
 */
export function dueParts(
  b: BillListItem,
): { amountMinor: number; dueDate: string; paidAt: string | null }[] {
  return paysByInstalments(b)
    ? b.instalments.map((i) => ({
        amountMinor: i.amountMinor,
        dueDate: i.dueDate,
        paidAt: i.paidToProviderAt,
      }))
    : [{ amountMinor: b.amountMinor, dueDate: b.dueDate, paidAt: b.paidToProviderAt }];
}

/** What a bill has due in a month (the bill, or its instalments due then). */
function dueIn(b: BillListItem, month: string, today: string): MonthItem['bills'] {
  return dueParts(b)
    .filter((p) => p.dueDate.slice(0, 7) === month)
    .map((p) => ({
      bill: b,
      amountMinor: p.amountMinor,
      status: billStatus(p.paidAt, p.dueDate, today),
    }));
}

/** When a service's next bill is expected: a recurring charge, or a guess from its cadence. */
export function expectedNext(
  svc: ServiceWithType,
  bills: BillListItem[],
  today: string,
): { dueDate: string; amountMinor: number | null } | null {
  if (!svc.isActive || svc.cancelledAt || svc.cadence === 'irregular' || !bills[0]) return null;
  const charge = upcomingCharge(svc, bills);
  if (charge) return { dueDate: charge.dueDate, amountMinor: charge.amountMinor };
  const est = estimatePerDay(bills, today.slice(0, 7));
  const guess = nextBillGuess(
    bills[0],
    svc.cadence,
    est.perDay,
    MONTHS_PER_BILL[svc.cadence] ? fixedPrice(bills) : null,
  );
  return guess ? { dueDate: guess.dueDate, amountMinor: guess.amountMinor } : null;
}

export function servicesMonth(
  hh: Household,
  memberId: string,
  today: string,
  month: string = today.slice(0, 7),
  scope: MonthScope = 'all',
  db: Db = getDb(),
): ServicesMonth {
  const thisMonth = today.slice(0, 7);
  const opts =
    scope === 'mine' ? { owner: memberId } : scope === 'household' ? {} : { viewer: memberId };
  const bills = listBills(hh.id, opts, db);
  const services = listServices(hh.id, { ...opts, includeInactive: true }, db);

  const items = new Map<string, MonthItem>();
  for (const svc of services) {
    const own = bills.filter((b) => b.serviceId === svc.id);
    const inMonth = own
      .flatMap((b) => dueIn(b, month, today))
      .sort((a, b) => a.status.dueDate.localeCompare(b.status.dueDate));
    // A service that stopped before this month, with nothing in it, isn't listed.
    if (!inMonth.length && (!svc.isActive || svc.cancelledAt)) continue;
    const first = inMonth[0]?.bill;
    const before = first
      ? own.find((b) => b.id !== first.id && b.dueDate < first.dueDate)
      : undefined;
    const pct =
      first && before && before.amountMinor > 0 ? first.amountMinor / before.amountMinor - 1 : null;
    // Only this month and the months ahead expect anything.
    const next = !inMonth.length && month >= thisMonth ? expectedNext(svc, own, today) : null;
    const last = own.find((b) => b.dueDate.slice(0, 7) < month);
    items.set(svc.id, {
      service: svc,
      bills: inMonth,
      amountMinor: inMonth.reduce((s, x) => s + x.amountMinor, 0),
      status: worst(inMonth.map((x) => x.status)),
      change:
        pct === null || !before
          ? null
          : {
              dir: Math.abs(pct) < SAME_BAND ? 'same' : pct > 0 ? 'up' : 'down',
              pct,
              month: before.dueDate.slice(0, 7),
            },
      expected: next,
      lastMonth: !inMonth.length && !next && last ? last.dueDate.slice(0, 7) : null,
    });
  }

  const listed = services.filter((s) => items.has(s.id));
  const entries = groupServices(listed).map((g): MonthEntry => {
    const its = g.services.map((s) => items.get(s.id)!);
    if (!g.typeSlug && !g.category) return { kind: 'service', item: its[0]! };
    return {
      kind: 'group',
      key: g.category ? `c-${g.category}` : `t-${g.typeSlug}`,
      typeSlug: g.typeSlug,
      category: g.category,
      label: g.label,
      icon: g.icon,
      colour: g.colour,
      items: its,
      amountMinor: its.reduce((s, i) => s + i.amountMinor, 0),
      status: worst(its.map((i) => i.status)),
      toCome: its.filter((i) => i.expected && i.expected.dueDate.slice(0, 7) === month).length,
    };
  });

  const all = [...items.values()];
  const monthBills = all.flatMap((i) => i.bills);
  return {
    month,
    prev: addMonths(month, -1),
    next: month < addMonths(thisMonth, 1) ? addMonths(month, 1) : null,
    totalMinor: all.reduce((s, i) => s + i.amountMinor, 0),
    counts: {
      bills: monthBills.length,
      paid: monthBills.filter((x) => x.status.key === 'paid').length,
      toPay: monthBills.filter((x) => x.status.key !== 'paid' && x.status.key !== 'overdue').length,
      overdue: monthBills.filter((x) => x.status.key === 'overdue').length,
      toCome: all.filter((i) => i.expected && i.expected.dueDate.slice(0, 7) === month).length,
    },
    entries,
  };
}
