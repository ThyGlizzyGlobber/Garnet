import { and, eq } from 'drizzle-orm';
import { getDb, type Db } from '@/db/client';
import { bill, share } from '@/db/schema';
import { listBills, type BillListItem } from '@/lib/bills';
import { daysInclusive, monthOf } from '@/lib/dates';
import { dueNow } from '@/lib/instalments';
import {
  addMonths,
  allocateToMonths,
  daysUntil,
  fiscalYearBounds,
  lastMonths,
} from '@/lib/periods';
import { listServices, type ServiceWithType } from '@/lib/services';
import { memberLedger } from '@/lib/stats';

/**
 * One member's own spending, for the personal dashboard: their share of every
 * household bill plus their personal bills (car rego, car insurance…), kept
 * apart so each can be read on its own. Like the household figures, amounts
 * accrue over the months a bill covers (a yearly rego is a twelfth a month).
 */
export interface PersonalSummary {
  month: string;
  thisMonth: SpendSplit;
  lastMonth: SpendSplit;
  fiscalYear: { label: string } & SpendSplit;
  /** The last 12 months, oldest first. */
  series: ({ month: string } & SpendSplit)[];
  /** This financial year so far, by service, largest first. */
  byService: { service: ServiceWithType; minor: number; personal: boolean }[];
  /** What I still owe housemates, and what they owe me. */
  owed: number;
  owedToMe: number;
  /** Shares of this year's household bills paid, of all of them. */
  sharesPaidThisFy: number;
  sharesThisFy: number;
  /** My personal services, and their bills still to pay (soonest first). */
  personalServices: ServiceWithType[];
  upcoming: (BillListItem & { daysUntilDue: number; dueMinor: number })[];
}

export interface SpendSplit {
  /** My shares of household bills. */
  shares: number;
  /** My personal bills. */
  personal: number;
  total: number;
}

const split = (shares: number, personal: number): SpendSplit => ({
  shares,
  personal,
  total: shares + personal,
});

/** The part of an amount spread over [periodStart, periodEnd] that falls in [start, end]. */
function accrued(
  amountMinor: number,
  periodStart: string,
  periodEnd: string,
  start: string,
  end: string,
): number {
  const s = periodStart > start ? periodStart : start;
  const e = periodEnd < end ? periodEnd : end;
  if (e < s) return 0;
  return Math.round((amountMinor * daysInclusive(s, e)) / daysInclusive(periodStart, periodEnd));
}

export function personalSummary(
  householdId: string,
  memberId: string,
  today: string,
  fiscalYearStartMonth: number,
  db: Db = getDb(),
): PersonalSummary {
  const month = monthOf(today);
  const months = lastMonths(month, 12);
  const fy = fiscalYearBounds(today, fiscalYearStartMonth);
  const fyEnd = fy.end > today ? today : fy.end;

  // Every amount I carry: each of my shares (over its bill's period), and each
  // personal bill (over its own).
  const items: { serviceId: string; amount: number; start: string; end: string; own: boolean }[] = [
    ...db
      .select({ s: share, b: bill })
      .from(share)
      .innerJoin(bill, eq(share.billId, bill.id))
      .where(and(eq(share.householdId, householdId), eq(share.memberId, memberId)))
      .all()
      .map(({ s, b }) => ({
        serviceId: b.serviceId,
        amount: s.amountMinor,
        start: b.periodStart,
        end: b.periodEnd,
        own: false,
      })),
    ...listBills(householdId, { owner: memberId }, db).map((b) => ({
      serviceId: b.serviceId,
      amount: b.amountMinor,
      start: b.periodStart,
      end: b.periodEnd,
      own: true,
    })),
  ];

  const byMonth = new Map(months.map((m) => [m, { shares: 0, personal: 0 }]));
  for (const it of items)
    for (const a of allocateToMonths(it.amount, it.start, it.end)) {
      const row = byMonth.get(a.month);
      if (!row) continue;
      if (it.own) row.personal += a.minor;
      else row.shares += a.minor;
    }
  const series = months.map((m) => {
    const r = byMonth.get(m)!;
    return { month: m, ...split(r.shares, r.personal) };
  });
  const inMonth = (m: string) => {
    const r = byMonth.get(m) ?? { shares: 0, personal: 0 };
    return split(r.shares, r.personal);
  };

  const services = new Map(
    listServices(householdId, { includeInactive: true, viewer: memberId }, db).map((s) => [
      s.id,
      s,
    ]),
  );
  let fyShares = 0;
  let fyPersonal = 0;
  const perService = new Map<string, number>();
  for (const it of items) {
    const minor = accrued(it.amount, it.start, it.end, fy.start, fyEnd);
    if (!minor) continue;
    if (it.own) fyPersonal += minor;
    else fyShares += minor;
    perService.set(it.serviceId, (perService.get(it.serviceId) ?? 0) + minor);
  }
  const byService = [...perService.entries()]
    .map(([id, minor]) => ({ service: services.get(id)!, minor }))
    .filter((x) => x.service)
    .map((x) => ({ ...x, personal: !!x.service.ownerMemberId }))
    .sort((a, b) => b.minor - a.minor);

  const ledger = memberLedger(householdId, memberId, today, fiscalYearStartMonth, db);
  const upcoming = listBills(householdId, { owner: memberId }, db)
    .filter((b) => !b.paidToProviderAt)
    .map((b) => {
      const d = dueNow(b);
      return { ...b, daysUntilDue: daysUntil(today, d.dueDate), dueMinor: d.amountMinor };
    })
    .sort((a, b) => a.daysUntilDue - b.daysUntilDue);

  return {
    month,
    thisMonth: inMonth(month),
    lastMonth: inMonth(addMonths(month, -1)),
    fiscalYear: { label: fy.label, ...split(fyShares, fyPersonal) },
    series,
    byService,
    owed: ledger?.owed ?? 0,
    owedToMe: ledger?.owedToMe ?? 0,
    sharesPaidThisFy: ledger?.paidThisFy ?? 0,
    sharesThisFy: ledger?.totalThisFy ?? 0,
    personalServices: listServices(householdId, { owner: memberId }, db),
    upcoming,
  };
}

/** Does this member have anything personal yet? (Shows the personal side of things.) */
export function hasPersonalServices(householdId: string, memberId: string, db: Db = getDb()) {
  return listServices(householdId, { owner: memberId, includeInactive: true }, db).length > 0;
}
