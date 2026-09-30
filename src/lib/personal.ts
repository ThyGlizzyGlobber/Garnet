import { and, eq } from 'drizzle-orm';
import { getDb, type Db } from '@/db/client';
import { bill, share } from '@/db/schema';
import { listBills, type BillListItem } from '@/lib/bills';
import { monthOf } from '@/lib/dates';
import { dueNow, dueParts, shareDueDate } from '@/lib/instalments';
import { addMonths, daysUntil, fiscalYearBounds, lastMonths } from '@/lib/periods';
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
  /** This month against last (a fraction), or null with nothing last month. */
  vsLastMonth: number | null;
  /** How much of this month is shares of household bills, as a percentage (0–100). */
  householdPct: number;
  /** Shares of this year's household bills paid, as a percentage (100 with none). */
  paidPct: number;
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

interface SpendSplit {
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

  // Every amount I carry, on the day it's due (owner, 2026-10-01: a bill
  // counts in full when it's due): each of my shares, and each part of my
  // personal bills (by instalments, each instalment).
  const items: { serviceId: string; amount: number; due: string; own: boolean }[] = [
    ...db
      .select({ s: share, b: bill })
      .from(share)
      .innerJoin(bill, eq(share.billId, bill.id))
      .where(and(eq(share.householdId, householdId), eq(share.memberId, memberId)))
      .all()
      .map(({ s, b }) => ({
        serviceId: b.serviceId,
        amount: s.amountMinor,
        due: shareDueDate(s, b),
        own: false,
      })),
    ...listBills(householdId, { owner: memberId }, db).flatMap((b) =>
      dueParts(b).map((p) => ({
        serviceId: b.serviceId,
        amount: p.amountMinor,
        due: p.dueDate,
        own: true,
      })),
    ),
  ];

  const byMonth = new Map(months.map((m) => [m, { shares: 0, personal: 0 }]));
  for (const it of items) {
    const row = byMonth.get(it.due.slice(0, 7));
    if (!row) continue;
    if (it.own) row.personal += it.amount;
    else row.shares += it.amount;
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
    if (it.due < fy.start || it.due > fyEnd) continue;
    const minor = it.amount;
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

  const thisMonth = inMonth(month);
  const lastMonth = inMonth(addMonths(month, -1));
  const sharesThisFy = ledger?.totalThisFy ?? 0;
  const sharesPaidThisFy = ledger?.paidThisFy ?? 0;
  return {
    month,
    thisMonth,
    lastMonth,
    vsLastMonth: lastMonth.total > 0 ? (thisMonth.total - lastMonth.total) / lastMonth.total : null,
    householdPct: thisMonth.total
      ? 100 - Math.round((thisMonth.personal / thisMonth.total) * 100)
      : 100,
    paidPct: sharesThisFy ? Math.round((sharesPaidThisFy / sharesThisFy) * 100) : 100,
    fiscalYear: { label: fy.label, ...split(fyShares, fyPersonal) },
    series,
    byService,
    owed: ledger?.owed ?? 0,
    owedToMe: ledger?.owedToMe ?? 0,
    sharesPaidThisFy,
    sharesThisFy,
    personalServices: listServices(householdId, { owner: memberId }, db),
    upcoming,
  };
}
