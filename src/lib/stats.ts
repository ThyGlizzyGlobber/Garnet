import { and, desc, eq, gte, inArray, lte, ne } from 'drizzle-orm';
import { getDb, type Db } from '@/db/client';
import { bill, member, share, type Bill, type Member, type Share } from '@/db/schema';
import { type BillListItem, listBills } from '@/lib/bills';
import { daysInclusive, monthOf } from '@/lib/dates';
import {
  addMonths,
  allocateToMonths,
  daysUntil,
  fiscalYearBounds,
  lastMonths,
  monthBounds,
} from '@/lib/periods';
import { listServices, type ServiceWithType } from '@/lib/services';

export interface ServiceTotal {
  service: ServiceWithType;
  minor: number;
}

export interface MonthRow {
  month: string;
  total: number;
  byService: Record<string, number>;
}

/** Bills whose billing period overlaps [start, end]. */
export function billsOverlapping(start: string, end: string, db: Db = getDb()): Bill[] {
  return db
    .select()
    .from(bill)
    .where(and(lte(bill.periodStart, end), gte(bill.periodEnd, start)))
    .all();
}

/** Accrued cost per month per service, pro-rata by days, for the given months. */
export function monthlySeries(months: string[], db: Db = getDb()): MonthRow[] {
  const first = months[0];
  const last = months[months.length - 1];
  if (!first || !last) return [];
  const bills = billsOverlapping(monthBounds(first).start, monthBounds(last).end, db);
  const rows = new Map<string, MonthRow>(
    months.map((m) => [m, { month: m, total: 0, byService: {} }]),
  );
  for (const b of bills) {
    for (const a of allocateToMonths(b.amountMinor, b.periodStart, b.periodEnd)) {
      const row = rows.get(a.month);
      if (!row) continue;
      row.total += a.minor;
      row.byService[b.serviceId] = (row.byService[b.serviceId] ?? 0) + a.minor;
    }
  }
  return months.map((m) => rows.get(m)!);
}

/** Accrued total for a date range, per service. */
export function totalsForRange(
  start: string,
  end: string,
  db: Db = getDb(),
): { total: number; byService: ServiceTotal[] } {
  const services = new Map(listServices(db, true).map((s) => [s.id, s]));
  const bills = billsOverlapping(start, end, db);
  const byId = new Map<string, number>();
  let total = 0;
  for (const b of bills) {
    // Portion of the bill's period inside the range.
    const s = b.periodStart > start ? b.periodStart : start;
    const e = b.periodEnd < end ? b.periodEnd : end;
    const days = daysInclusive(s, e);
    if (days <= 0) continue;
    const minor = Math.round((b.amountMinor * days) / daysInclusive(b.periodStart, b.periodEnd));
    total += minor;
    byId.set(b.serviceId, (byId.get(b.serviceId) ?? 0) + minor);
  }
  const byService = [...byId.entries()]
    .map(([id, minor]) => ({ service: services.get(id)!, minor }))
    .filter((x) => x.service)
    .sort((a, b) => b.minor - a.minor);
  return { total, byService };
}

export interface DashboardSummary {
  thisMonth: { month: string; total: number; byService: ServiceTotal[] };
  lastMonthTotal: number;
  sameMonthLastYearTotal: number | null;
  fiscalYear: {
    label: string;
    start: string;
    end: string;
    total: number;
    byService: ServiceTotal[];
  };
  series: MonthRow[];
  services: ServiceWithType[];
  upcoming: (BillListItem & { daysUntilDue: number })[];
  overdue: (BillListItem & { daysUntilDue: number })[];
  anomalies: BillListItem[];
  activeMemberCount: number;
  costPerPersonPerDay: number | null;
}

export function dashboardSummary(
  today: string,
  fiscalYearStartMonth: number,
  db: Db = getDb(),
): DashboardSummary {
  const month = monthOf(today);
  const mb = monthBounds(month);
  const thisMonth = totalsForRange(mb.start, mb.end, db);
  const lm = monthBounds(addMonths(month, -1));
  const lastMonthTotal = totalsForRange(lm.start, lm.end, db).total;
  const ly = monthBounds(addMonths(month, -12));
  const lyBills = billsOverlapping(ly.start, ly.end, db);
  const sameMonthLastYearTotal = lyBills.length ? totalsForRange(ly.start, ly.end, db).total : null;
  const fy = fiscalYearBounds(today, fiscalYearStartMonth);
  const fyTotals = totalsForRange(fy.start, fy.end > today ? today : fy.end, db);
  const series = monthlySeries(lastMonths(month, 12), db);
  const all = listBills(db);
  const unpaid = all.filter((b) => !b.paidToProviderAt);
  const withDays = (b: BillListItem) => ({ ...b, daysUntilDue: daysUntil(today, b.dueDate) });
  const overdue = unpaid
    .filter((b) => b.dueDate < today)
    .map(withDays)
    .sort((a, b) => a.daysUntilDue - b.daysUntilDue);
  const upcoming = unpaid
    .filter((b) => b.dueDate >= today)
    .map(withDays)
    .sort((a, b) => a.daysUntilDue - b.daysUntilDue)
    .slice(0, 8);
  const anomalies = all.filter((b) => b.isAnomaly).slice(0, 5);
  const members = db.select().from(member).all();
  const activeMemberCount = members.filter(
    (m) => m.activeFrom <= today && (!m.activeTo || m.activeTo >= today),
  ).length;
  const daysSoFar = daysInclusive(mb.start, today);
  const costPerPersonPerDay =
    activeMemberCount > 0 && thisMonth.total > 0
      ? Math.round(thisMonth.total / daysInclusive(mb.start, mb.end) / activeMemberCount)
      : null;
  return {
    thisMonth: { month, ...thisMonth },
    lastMonthTotal,
    sameMonthLastYearTotal,
    fiscalYear: { ...fy, ...fyTotals },
    series,
    services: listServices(db),
    upcoming,
    overdue,
    anomalies,
    activeMemberCount,
    costPerPersonPerDay: daysSoFar > 0 ? costPerPersonPerDay : null,
  };
}

export type LedgerShare = Share & { bill: Bill; service: ServiceWithType; payer: Member | null };

export interface MemberLedger {
  member: Member;
  owed: number; // unpaid, non-payer shares
  paidThisFy: number;
  totalThisFy: number;
  unpaid: LedgerShare[];
  recent: LedgerShare[];
  /** Amount others still owe this member for bills they paid. */
  owedToMe: number;
  owedToMeBy: { member: Member; minor: number }[];
}

export function memberLedger(
  memberId: string,
  today: string,
  fiscalYearStartMonth: number,
  db: Db = getDb(),
): MemberLedger | null {
  const me = db.select().from(member).where(eq(member.id, memberId)).get();
  if (!me) return null;
  const services = new Map(listServices(db, true).map((s) => [s.id, s]));
  const members = new Map(
    db
      .select()
      .from(member)
      .all()
      .map((m) => [m.id, m]),
  );
  const fy = fiscalYearBounds(today, fiscalYearStartMonth);
  const rows = db
    .select()
    .from(share)
    .innerJoin(bill, eq(share.billId, bill.id))
    .where(eq(share.memberId, memberId))
    .orderBy(desc(bill.dueDate))
    .all();
  const enrich = (r: { share: Share; bill: Bill }): LedgerShare => {
    const svc = services.get(r.bill.serviceId)!;
    return {
      ...r.share,
      bill: r.bill,
      service: svc,
      payer: svc.payerMemberId ? (members.get(svc.payerMemberId) ?? null) : null,
    };
  };
  const mine = rows.map(enrich);
  const unpaid = mine.filter((s) => !s.paidAt);
  const inFy = mine.filter((s) => s.bill.periodStart >= fy.start && s.bill.periodStart <= fy.end);
  // What others owe me: unpaid non-payer shares on bills for services I pay.
  const myServiceIds = [...services.values()]
    .filter((s) => s.payerMemberId === memberId)
    .map((s) => s.id);
  const owedRows = myServiceIds.length
    ? db
        .select()
        .from(share)
        .innerJoin(bill, eq(share.billId, bill.id))
        .where(and(inArray(bill.serviceId, myServiceIds), ne(share.memberId, memberId)))
        .all()
        .filter((r) => !r.share.paidAt)
    : [];
  const byMember = new Map<string, number>();
  for (const r of owedRows)
    byMember.set(r.share.memberId, (byMember.get(r.share.memberId) ?? 0) + r.share.amountMinor);
  return {
    member: me,
    owed: unpaid.reduce((s, x) => s + x.amountMinor, 0),
    paidThisFy: inFy.filter((s) => s.paidAt).reduce((s, x) => s + x.amountMinor, 0),
    totalThisFy: inFy.reduce((s, x) => s + x.amountMinor, 0),
    unpaid,
    recent: mine.slice(0, 20),
    owedToMe: [...byMember.values()].reduce((s, x) => s + x, 0),
    owedToMeBy: [...byMember.entries()]
      .map(([id, minor]) => ({ member: members.get(id)!, minor }))
      .filter((x) => x.member),
  };
}

/** Per-member unpaid totals, for the wall and the dashboard's who-owes-what strip. */
export function householdBalances(
  db: Db = getDb(),
): { member: Member; owed: number; unpaidCount: number }[] {
  const members = db.select().from(member).all();
  const rows = db
    .select()
    .from(share)
    .all()
    .filter((s) => !s.paidAt);
  return members.map((m) => {
    const mine = rows.filter((s) => s.memberId === m.id);
    return {
      member: m,
      owed: mine.reduce((s, x) => s + x.amountMinor, 0),
      unpaidCount: mine.length,
    };
  });
}

/** Cheap presence check used for empty states. */
export function hasAnyBills(db: Db = getDb()): boolean {
  return db.select({ id: bill.id }).from(bill).limit(1).get() !== undefined;
}
