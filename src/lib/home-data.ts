import { inArray } from 'drizzle-orm';
import { getDb, type Db } from '@/db/client';
import { share, type Household, type Member } from '@/db/schema';
import { recentActivity, type ActivityEvent } from '@/lib/activity';
import { billDate } from '@/lib/bill-month';
import { billStatus, type BillStatus } from '@/lib/bill-status';
import { listBills } from '@/lib/bills';
import { billsAddress } from '@/lib/bills-address';
import { householdUsage } from '@/lib/consumption';
import { addDays, daysBetween, daysInclusive } from '@/lib/dates';
import { canChoosePlan, dueNow, paysByInstalments, planUndecided } from '@/lib/instalments';
import { hasHousemates, listActiveMembers, listMembers } from '@/lib/members';
import { monthDue } from '@/lib/month-due';
import { ownershipQuestions } from '@/lib/ownership';
import { addMonths, lastMonths, monthBounds } from '@/lib/periods';
import { nextExpected } from '@/lib/expected';
import { nextMonth, perDayFallback, projectMonth } from '@/lib/projections';
import { documentCounts } from '@/lib/review';
import { priceChange } from '@/lib/recurring';
import { seasonAhead } from '@/lib/seasons';
import { chargedAfterCancel, listServices } from '@/lib/services';
import { hasAnyBills, monthlySeries, totalsForRange } from '@/lib/stats';
import { weatherWeek } from '@/lib/weather-week';
import { weekFacts, type WeekFacts } from '@/lib/week-summary';

/**
 * Everything the Home widgets draw (BRAND.md §9, SCOPE-redesign.md R4),
 * worked out once per visit and handed to the grid as plain data: numbers,
 * dates and ids, never words (the widgets give them words) and nothing that
 * can't be sent to the browser. The wall uses the same data.
 */

interface HomeService {
  id: string;
  name: string;
  provider: string;
  icon: string;
  colour: string;
  unit: string | null;
  /** This month's accrued cost, minor units. */
  thisMonthMinor: number;
  /** Twelve months of accrued cost, oldest first. */
  spark: number[];
  latest: {
    billId: string;
    amountMinor: number;
    status: BillStatus;
  } | null;
  /** Cost per day against the same time last year, as a fraction. */
  vsLastYear: number | null;
  /** The latest bill's usage a day, with the household's limit when one is set. */
  usage: {
    perDay: number;
    unit: string;
    limitPerDay: number | null;
    vsLastYear: number | null;
  } | null;
  /** Housemates' shares of what is due next on the latest bill: how many are paid. */
  shares: { paid: number; total: number } | null;
}

interface Upcoming {
  billId: string;
  serviceId: string;
  serviceName: string;
  icon: string;
  colour: string;
  dueDate: string;
  days: number;
  amountMinor: number;
  /** Yours: a personal bill. You pay: the household's bill you pay. Share: your part of a housemate's bill. */
  kind: 'yours' | 'you-pay' | 'share';
  payerName: string | null;
  instalment: { n: number; of: number } | null;
  status: BillStatus;
  /** The viewer's share row, when the item is their share of a housemate's bill. */
  shareId: string | null;
}

export interface HomeData {
  today: string;
  locale: string;
  currency: string;
  timezone: string;
  you: { id: string; name: string; colour: string };
  members: { id: string; name: string; colour: string }[];
  split: boolean;
  housemates: boolean;
  postcode: boolean;
  fresh: boolean;
  address: string | null;
  services: HomeService[];
  mine: HomeService[];
  month: {
    month: string;
    day: number;
    days: number;
    knownMinor: number;
    /** The household's bills and instalments due this month: how many, and how much is paid. */
    bills: number;
    paidBills: number;
    dueMinor: number;
    paidMinor: number;
    projectedMinor: number;
    vsLastMonth: number | null;
    byService: { id: string; minor: number }[];
    yourMinor: number | null;
    /**
     * Every bill (or instalment) the viewer sees due this month, the
     * household's and their own, soonest first: Home's hero list. The same
     * parts the Services page's summary adds up, so the two always agree
     * (SCOPE-redesign-2.md §6).
     */
    list: {
      billId: string;
      serviceId: string;
      serviceName: string;
      amountMinor: number;
      dueDate: string;
      paid: boolean;
      instalment: { n: number; of: number } | null;
    }[];
  };
  /** The next bill expected to arrive (not in yet), across the viewer's services. */
  nextExpected: {
    serviceId: string;
    serviceName: string;
    dueDate: string;
    amountMinor: number;
  } | null;
  /** How many services the viewer sees (the household's and their own). */
  serviceCount: number;
  monthly: { month: string; totalMinor: number; byService: Record<string, number> }[];
  forecast: { month: string; totalMinor: number }[];
  upcoming: Upcoming[];
  money: {
    people: { memberId: string; owesYou: number; youOwe: number; net: number }[];
    owedToYou: number;
    youOwe: number;
    debts: {
      fromId: string;
      toId: string;
      amountMinor: number;
      billId: string;
      serviceName: string;
      dueDate: string;
    }[];
  } | null;
  settled: { paid: number; total: number; open: { memberId: string; n: number }[] } | null;
  setAside: { month: string; each: { memberId: string; minor: number }[] } | null;
  usage: {
    serviceId: string;
    serviceName: string;
    icon: string;
    colour: string;
    perDay: number;
    unit: string;
    limitPerDay: number | null;
    limitMonthly: number | null;
    vsLastYear: number | null;
    similar: number | null;
    spark: number[];
  } | null;
  notices: (
    | { kind: 'cancelled'; serviceName: string; href: string }
    | { kind: 'price'; serviceName: string; fromMinor: number; toMinor: number; href: string }
    | { kind: 'unusual'; serviceName: string; pct: number | null; href: string }
    | { kind: 'plan'; serviceName: string; href: string }
    | { kind: 'whose'; serviceName: string; href: string }
    | { kind: 'inbox'; count: number; href: string }
    | { kind: 'season'; serviceName: string; season: string; pct: number; href: string }
  )[];
  inbox: {
    needs: number;
    analysedThisWeek: number;
    recent: Extract<ActivityEvent, { kind: 'document' }>[];
  };
  plan: {
    billId: string;
    serviceName: string;
    next: { n: number; of: number; amountMinor: number; dueDate: string; status: BillStatus };
    dots: ('done' | 'next' | 'later')[];
    yourMinor: number | null;
  } | null;
  weather: {
    place: string | null;
    days: {
      date: string;
      hi: number | null;
      lo: number | null;
      code: number | null;
      need: 'heat' | 'cool' | null;
    }[];
    impact: { minor: number; kind: 'heating' | 'cooling'; vsNormal: boolean } | null;
  } | null;
  calendar: {
    /** The window's first day (a Monday, a week back). */
    start: string;
    items: {
      date: string;
      amountMinor: number;
      paid: boolean;
      instalment: { n: number; of: number } | null;
      billId: string;
      serviceId: string;
      serviceName: string;
      colour: string;
    }[];
  };
  activity: ActivityEvent[];
  week: WeekFacts;
  season: {
    season: string;
    startMonth: string;
    daysUntil: number;
    rows: {
      serviceId: string;
      serviceName: string;
      icon: string;
      colour: string;
      ratio: number;
    }[];
    monthlyMoreMinor: number;
  } | null;
  start: { household: boolean; firstBill: boolean; invited: boolean; postcode: boolean };
}

const bad = (n: number | null | undefined) => n === null || n === undefined || !Number.isFinite(n);

export function homeData(hh: Household, me: Member, today: string, db: Db = getDb()): HomeData {
  const split = hh.splitMode === 'shared';
  const month = today.slice(0, 7);
  const { start: mStart, end: mEnd } = monthBounds(month);
  const months = lastMonths(month, 12);
  const members = listMembers(hh.id, db);
  const memberName = new Map(members.map((m) => [m.id, m.name]));
  const fresh = !hasAnyBills(hh.id, db);

  // Bills the viewer sees: the household's and their own, with every share.
  const bills = listBills(hh.id, { viewer: me.id }, db);
  const billIds = bills.map((b) => b.id);
  const shares = billIds.length
    ? db.select().from(share).where(inArray(share.billId, billIds)).all()
    : [];
  const sharesOf = (billId: string, instalment: number) =>
    shares.filter((s) => s.billId === billId && (s.instalment || 0) === instalment);

  // Services with this month's cost and a year's trend.
  const series = monthlySeries(hh.id, months, db);
  const thisMonth = totalsForRange(hh.id, mStart, mEnd, db);
  const accrued = new Map(thisMonth.byService.map((t) => [t.service.id, t.minor]));
  const usage = householdUsage(hh.id, db);
  const latestOf = (id: string) => {
    const b = bills.find((x) => x.serviceId === id);
    if (!b) return null;
    const due = dueNow(b);
    const paid = paysByInstalments(b)
      ? (b.instalments.find((i) => i.seq === due.seq)?.paidToProviderAt ?? null)
      : b.paidToProviderAt;
    return {
      billId: b.id,
      amountMinor: due.amountMinor,
      status: billStatus(paid, due.dueDate, today),
    };
  };
  const usageOf = (id: string): HomeService['usage'] => {
    const u = usage.find((x) => x.serviceId === id);
    if (!u || u.latest.perDay === null) return null;
    return {
      perDay: u.latest.perDay,
      unit: u.unit ?? '',
      limitPerDay: u.limit?.perDay ?? null,
      vsLastYear: u.lastYear?.usage.pct ?? null,
    };
  };
  const sharesPaidOf = (id: string): HomeService['shares'] => {
    const b = bills.find((x) => x.serviceId === id);
    if (!split || !b || b.ownerMemberId) return null;
    const list = sharesOf(b.id, dueNow(b).seq ?? 0).filter(
      (s) => s.memberId !== b.service.payerMemberId,
    );
    return list.length ? { paid: list.filter((s) => s.paidAt).length, total: list.length } : null;
  };
  const toService = (s: ReturnType<typeof listServices>[number]): HomeService => ({
    id: s.id,
    name: s.name,
    provider: s.provider,
    icon: s.type.icon,
    colour: s.colour,
    unit: s.usageUnit,
    thisMonthMinor: accrued.get(s.id) ?? 0,
    spark: series.map((r) => r.byService[s.id] ?? 0),
    latest: latestOf(s.id),
    vsLastYear: usage.find((u) => u.serviceId === s.id)?.lastYear?.cost.pct ?? null,
    usage: usageOf(s.id),
    shares: sharesPaidOf(s.id),
  });
  const services = listServices(hh.id, {}, db).map(toService);
  const mine = listServices(hh.id, { owner: me.id }, db).map((s) => ({
    ...toService(s),
    thisMonthMinor: latestOf(s.id)?.amountMinor ?? 0,
  }));
  const serviceById = new Map([...services, ...mine].map((s) => [s.id, s]));

  // This month and the months around it.
  const projected = fresh ? null : projectMonth(hh.id, month, db);
  const next = fresh ? null : projectMonth(hh.id, nextMonth(today), db);
  const lastMonthTotal = series.at(-2)?.total ?? 0;
  const yourMinor = projected?.setAside.find((s) => s.member.id === me.id)?.minor ?? null;

  // The household's bills and instalments due this month, and which the provider has.
  const dueThisMonth = monthDue(bills, mStart, mEnd);
  // Every part the viewer sees due this month (their own bills too), soonest first.
  const monthList: HomeData['month']['list'] = [];
  for (const b of bills) {
    const svc = serviceById.get(b.serviceId);
    if (!svc) continue;
    const parts = paysByInstalments(b)
      ? b.instalments.map((i) => ({
          amountMinor: i.amountMinor,
          dueDate: i.dueDate,
          paid: !!i.paidToProviderAt,
          instalment: { n: i.seq, of: b.instalments.length },
        }))
      : [
          {
            amountMinor: b.amountMinor,
            dueDate: b.dueDate,
            paid: !!b.paidToProviderAt,
            instalment: null,
          },
        ];
    for (const p of parts)
      if (p.dueDate >= mStart && p.dueDate <= mEnd)
        monthList.push({ billId: b.id, serviceId: b.serviceId, serviceName: svc.name, ...p });
  }
  monthList.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  // The next bill expected to arrive, across the services the viewer sees.
  const viewerServices = listServices(hh.id, { viewer: me.id }, db);
  let soonest: HomeData['nextExpected'] = null;
  for (const svc of viewerServices) {
    const own = bills.filter((b) => b.serviceId === svc.id);
    const e = nextExpected(svc, own, perDayFallback(hh.id, svc, today, db));
    if (e && e.dueDate >= today && (!soonest || e.dueDate < soonest.dueDate))
      soonest = {
        serviceId: svc.id,
        serviceName: svc.name,
        dueDate: e.dueDate,
        amountMinor: e.amountMinor,
      };
  }

  // What the viewer pays next (a month ahead).
  const upcoming: Upcoming[] = [];
  for (const b of bills) {
    const svc = serviceById.get(b.serviceId);
    if (!svc) continue;
    const due = dueNow(b);
    const inst = paysByInstalments(b) ? b.instalments.find((i) => i.seq === due.seq) : null;
    const paid = inst ? inst.paidToProviderAt : b.paidToProviderAt;
    if (paid) continue;
    const days = daysBetween(today, due.dueDate);
    if (days > 30) continue;
    const st = billStatus(null, due.dueDate, today);
    const instalment = inst ? { n: inst.seq, of: b.instalments.length } : null;
    const base = {
      billId: b.id,
      serviceId: b.serviceId,
      serviceName: svc.name,
      icon: svc.icon,
      colour: svc.colour,
      dueDate: due.dueDate,
      days,
      instalment,
      status: st,
    };
    if (b.ownerMemberId) {
      upcoming.push({
        ...base,
        amountMinor: due.amountMinor,
        kind: 'yours',
        payerName: null,
        shareId: null,
      });
      continue;
    }
    const payer = b.service.payerMemberId;
    if (!split || payer === me.id) {
      upcoming.push({
        ...base,
        amountMinor: due.amountMinor,
        kind: 'you-pay',
        payerName: payer ? (memberName.get(payer) ?? null) : null,
        shareId: null,
      });
      continue;
    }
    const my = sharesOf(b.id, due.seq ?? 0).find((s) => s.memberId === me.id);
    if (!my || my.paidAt) continue;
    upcoming.push({
      ...base,
      amountMinor: my.amountMinor,
      kind: 'share',
      payerName: payer ? (memberName.get(payer) ?? null) : null,
      shareId: my.id,
    });
  }
  upcoming.sort((a, b) => a.days - b.days);

  // Money between housemates: every unpaid share is owed to the bill's payer
  // (of an instalment plan, the next instalment's).
  let money: HomeData['money'] = null;
  let settled: HomeData['settled'] = null;
  if (split) {
    const debts: NonNullable<HomeData['money']>['debts'] = [];
    for (const b of bills) {
      if (b.ownerMemberId) continue;
      const payer = b.service.payerMemberId;
      if (!payer) continue;
      const open = shares.filter((x) => x.billId === b.id && !x.paidAt && x.memberId !== payer);
      // A bill paid by instalments: only a person's next unpaid instalment is owed now.
      const nextSeq = new Map<string, number>();
      for (const s of open)
        if (s.instalment)
          nextSeq.set(s.memberId, Math.min(nextSeq.get(s.memberId) ?? Infinity, s.instalment));
      for (const s of open) {
        if (s.instalment && s.instalment > (nextSeq.get(s.memberId) ?? 0)) continue;
        const inst = s.instalment ? b.instalments.find((i) => i.seq === s.instalment) : null;
        debts.push({
          fromId: s.memberId,
          toId: payer,
          amountMinor: s.amountMinor,
          billId: b.id,
          serviceName: b.service.name,
          dueDate: s.dueDate ?? inst?.dueDate ?? b.dueDate,
        });
      }
    }
    const people = members
      .filter((m) => m.id !== me.id)
      .map((m) => {
        const owesYou = debts.filter((d) => d.fromId === m.id && d.toId === me.id);
        const youOwe = debts.filter((d) => d.fromId === me.id && d.toId === m.id);
        const a = owesYou.reduce((s, d) => s + d.amountMinor, 0);
        const o = youOwe.reduce((s, d) => s + d.amountMinor, 0);
        return { memberId: m.id, owesYou: a, youOwe: o, net: a - o };
      })
      .filter((p) => p.owesYou || p.youOwe);
    money = {
      people,
      owedToYou: people.reduce((s, p) => s + p.owesYou, 0),
      youOwe: people.reduce((s, p) => s + p.youOwe, 0),
      debts,
    };
    // Shares due this month (or overdue into it), and who still has some open.
    const due = shares
      .map((s) => {
        const b = bills.find((x) => x.id === s.billId);
        if (!b || b.ownerMemberId || s.memberId === b.service.payerMemberId) return null;
        const inst = s.instalment ? b.instalments.find((i) => i.seq === s.instalment) : null;
        return { s, dueDate: s.dueDate ?? inst?.dueDate ?? b.dueDate };
      })
      .filter((x): x is { s: (typeof shares)[number]; dueDate: string } => !!x)
      .filter((x) => x.dueDate <= mEnd && (x.dueDate >= mStart || !x.s.paidAt));
    const open = new Map<string, number>();
    for (const x of due) if (!x.s.paidAt) open.set(x.s.memberId, (open.get(x.s.memberId) ?? 0) + 1);
    settled = {
      paid: due.filter((x) => !!x.s.paidAt).length,
      total: due.length,
      open: [...open].map(([memberId, n]) => ({ memberId, n })),
    };
  }

  // The first bill with an instalment plan still running.
  let plan: HomeData['plan'] = null;
  const planned = bills.find(
    (b) => paysByInstalments(b) && b.instalments.some((i) => !i.paidToProviderAt),
  );
  if (planned) {
    const nxt = planned.instalments.find((i) => !i.paidToProviderAt)!;
    plan = {
      billId: planned.id,
      serviceName: planned.service.name,
      next: {
        n: nxt.seq,
        of: planned.instalments.length,
        amountMinor: nxt.amountMinor,
        dueDate: nxt.dueDate,
        status: billStatus(null, nxt.dueDate, today),
      },
      dots: planned.instalments.map((i) =>
        i.paidToProviderAt ? 'done' : i.seq === nxt.seq ? 'next' : 'later',
      ),
      yourMinor:
        sharesOf(planned.id, nxt.seq).find((s) => s.memberId === me.id)?.amountMinor ?? null,
    };
  }

  // Electricity (or the first service with usage and a per-day figure).
  const u =
    usage.find((x) => serviceById.get(x.serviceId)?.icon === 'bolt' && x.latest.perDay !== null) ??
    usage.find((x) => x.latest.perDay !== null);
  const uSvc = u ? serviceById.get(u.serviceId) : null;
  const usageOut: HomeData['usage'] =
    u && uSvc && u.latest.perDay !== null
      ? {
          serviceId: u.serviceId,
          serviceName: uSvc.name,
          icon: uSvc.icon,
          colour: uSvc.colour,
          perDay: u.latest.perDay,
          unit: u.unit ?? '',
          limitPerDay: u.limit?.perDay ?? null,
          limitMonthly: u.limit?.monthly ?? null,
          vsLastYear: u.lastYear?.usage.pct ?? null,
          similar: u.similarHouseholds?.pct ?? null,
          spark: bills
            .filter((b) => b.serviceId === u.serviceId && b.usageQuantity)
            .slice(0, 8)
            .reverse()
            .map((b) => b.usageQuantity! / daysInclusive(b.periodStart, b.periodEnd)),
        }
      : null;

  // Heads up.
  const notices: HomeData['notices'] = [];
  // A recurring service whose latest bill changed the price, in the last 45 days.
  for (const svc of listServices(hh.id, { viewer: me.id }, db)) {
    const own = bills.filter((b) => b.serviceId === svc.id);
    const change = priceChange(svc, own);
    const changed = change && own.find((b) => b.id === change.billId);
    if (change && changed && billDate(changed) >= addDays(today, -45))
      notices.push({
        kind: 'price',
        serviceName: svc.name,
        fromMinor: change.fromMinor,
        toMinor: change.toMinor,
        href: `/bills/${change.billId}`,
      });
  }
  // A cancelled subscription that's still charging, in the last three months.
  for (const b of bills.filter(
    (x) => chargedAfterCancel(x.service, x) && billDate(x) >= addDays(today, -90),
  ))
    notices.push({ kind: 'cancelled', serviceName: b.service.name, href: `/bills/${b.id}` });
  for (const b of bills.filter((x) => x.isAnomaly).slice(0, 2))
    notices.push({
      kind: 'unusual',
      serviceName: b.service.name,
      pct: usage.find((x) => x.serviceId === b.serviceId)?.lastYear?.cost.pct ?? null,
      href: `/bills/${b.id}`,
    });
  for (const b of bills.filter(
    (x) => planUndecided(x) && !x.paidToProviderAt && canChoosePlan(me, x),
  ))
    notices.push({ kind: 'plan', serviceName: b.service.name, href: `/bills/${b.id}` });
  if (hasHousemates(hh.id, db))
    for (const q of ownershipQuestions(hh.id, me, db))
      notices.push({
        kind: 'whose',
        serviceName: q.service.name,
        href: q.billId ? `/bills/${q.billId}` : `/services/${q.service.id}`,
      });
  const counts = documentCounts(hh.id, { viewer: me.id }, db);
  if (counts.needs_review > 0)
    notices.push({ kind: 'inbox', count: counts.needs_review, href: '/inbox' });
  const seasons = seasonAhead(hh.id, today, db);
  for (const n of seasons.slice(0, 1))
    notices.push({
      kind: 'season',
      serviceName: n.serviceName,
      season: n.season,
      pct: n.costRatio - 1,
      href: `/services/${n.serviceId}`,
    });

  // Activity, the Inbox and the calendar.
  const activity = recentActivity(hh.id, today, 16, { viewer: me.id }, db);
  const docs = activity.filter(
    (e): e is Extract<ActivityEvent, { kind: 'document' }> => e.kind === 'document',
  );
  const weekAgo = addDays(today, -7);
  const dow = (new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7;
  const calStart = addDays(today, -dow - 7);
  const calEnd = addDays(calStart, 34);
  const calendar: HomeData['calendar'] = { start: calStart, items: [] };
  for (const b of bills) {
    const svc = serviceById.get(b.serviceId);
    if (!svc) continue;
    const list = paysByInstalments(b)
      ? b.instalments.map((i) => ({
          date: i.dueDate,
          amountMinor: i.amountMinor,
          paid: !!i.paidToProviderAt,
          instalment: { n: i.seq, of: b.instalments.length },
        }))
      : [
          {
            date: b.dueDate,
            amountMinor: b.amountMinor,
            paid: !!b.paidToProviderAt,
            instalment: null,
          },
        ];
    for (const x of list)
      if (x.date >= calStart && x.date <= calEnd)
        calendar.items.push({
          ...x,
          billId: b.id,
          serviceId: b.serviceId,
          serviceName: svc.name,
          colour: svc.colour,
        });
  }
  calendar.items.sort((a, b) => (a.date < b.date ? -1 : 1));

  // Weather and the season ahead.
  const wx = weatherWeek(hh.id, today, db);
  const weather: HomeData['weather'] = wx && {
    place: wx.place,
    days: wx.days.map((d) => ({
      date: d.date,
      hi: d.tempMax,
      lo: d.tempMin,
      code: d.code,
      need: d.heating ? 'heat' : d.cooling ? 'cool' : null,
    })),
    impact: wx.impact,
  };
  const first = seasons[0];
  const season: HomeData['season'] = first
    ? {
        season: first.season,
        startMonth: first.startMonth,
        daysUntil: first.daysUntil,
        rows: seasons.slice(0, 3).flatMap((n) => {
          const svc = serviceById.get(n.serviceId);
          return svc
            ? [
                {
                  serviceId: n.serviceId,
                  serviceName: svc.name,
                  icon: svc.icon,
                  colour: svc.colour,
                  ratio: n.costRatio,
                },
              ]
            : [];
        }),
        monthlyMoreMinor: seasons.reduce((s, n) => s + n.monthlyImpactMinor, 0),
      }
    : null;

  const active = listActiveMembers(hh.id, today, db);
  return {
    today,
    locale: hh.locale,
    currency: hh.currency,
    timezone: hh.timezone,
    you: { id: me.id, name: me.name, colour: me.colour },
    members: active.map((m) => ({ id: m.id, name: m.name, colour: m.colour })),
    split,
    housemates: hasHousemates(hh.id, db),
    postcode: !!hh.postalCode,
    fresh,
    address: billsAddress(hh, db),
    services,
    mine,
    month: {
      month,
      day: Number(today.slice(8, 10)),
      days: daysInclusive(mStart, mEnd),
      knownMinor: thisMonth.total,
      ...dueThisMonth,
      projectedMinor: Math.max(projected?.totalMinor ?? thisMonth.total, thisMonth.total),
      vsLastMonth: lastMonthTotal > 0 ? (thisMonth.total - lastMonthTotal) / lastMonthTotal : null,
      byService: thisMonth.byService.map((t) => ({ id: t.service.id, minor: t.minor })),
      yourMinor: bad(yourMinor) ? null : yourMinor,
      list: monthList,
    },
    nextExpected: soonest,
    serviceCount: viewerServices.length,
    monthly: series.map((r) => ({ month: r.month, totalMinor: r.total, byService: r.byService })),
    forecast: fresh
      ? []
      : Array.from({ length: 6 }, (_, i) => {
          const p = projectMonth(hh.id, addMonths(month, i + 1), db);
          return { month: p.month, totalMinor: p.totalMinor };
        }),
    upcoming,
    money,
    settled,
    setAside:
      split && next
        ? {
            month: next.month,
            each: next.setAside.map((s) => ({ memberId: s.member.id, minor: s.minor })),
          }
        : null,
    usage: usageOut,
    notices,
    inbox: {
      needs: counts.needs_review,
      analysedThisWeek: docs.filter((d) => d.date >= weekAgo && d.state === 'analysed').length,
      recent: docs.slice(0, 6),
    },
    plan,
    weather,
    calendar,
    activity,
    week: weekFacts(
      upcoming.map((u) => ({
        serviceName: u.serviceName,
        days: u.days,
        dueDate: u.dueDate,
        amountMinor: u.amountMinor,
        share: u.kind === 'share',
        instalment: u.instalment,
      })),
      (money?.debts ?? []).map((d) => ({
        fromName: memberName.get(d.fromId) ?? '',
        toName: memberName.get(d.toId) ?? '',
        amountMinor: d.amountMinor,
        serviceName: d.serviceName,
        overdue: d.dueDate < today,
        involvesYou: d.fromId === me.id || d.toId === me.id,
      })),
      wx?.days ?? null,
    ),
    season,
    start: {
      household: true,
      firstBill: !fresh,
      invited: members.length > 1,
      postcode: !!hh.postalCode,
    },
  };
}
