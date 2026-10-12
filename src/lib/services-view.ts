import type { Household, Member } from '@/db/schema';
import { getDb, type Db } from '@/db/client';
import { SAME_BAND } from '@/lib/averages';
import type { BillStatus } from '@/lib/bill-status';
import { listBills, type BillListItem } from '@/lib/bills';
import { fixedPrice } from '@/lib/cadence';
import { householdUsage, usageHistory, type UsageComparison } from '@/lib/consumption';
import { expectedBills } from '@/lib/expected';
import { dueNow, dueParts, paysByInstalments } from '@/lib/instalments';
import { arrange, arrangeMine, navKey, type NavGroup } from '@/lib/nav-layout';
import { getNavLayout } from '@/lib/nav-store';
import { addMonths, fiscalYearBounds, lastMonths, monthBounds } from '@/lib/periods';
import { perDayFallback } from '@/lib/projections';
import { isEssential, type GroupedCategory } from '@/lib/service-categories';
import { groupServices, listServices, type ServiceWithType } from '@/lib/services';
import { servicesMonth, type MonthItem } from '@/lib/services-month';

/**
 * The Services page (SCOPE-services.md): the analytics tool's three lenses
 * (this month, the calendar year, the financial year) and a tile per
 * service for the lens in view. Pure numbers in typed pieces; the page
 * words and formats them.
 */

export type Lens = 'month' | 'year' | 'fy';

/** Which period each lens is on: a month "2026-09", a year "2026", a financial year by its start year "2026". */
export interface Periods {
  month: string;
  year: string;
  fy: string;
}

interface LensBar {
  /** "2026-09" */
  month: string;
  minor: number;
  /** The same month a year earlier (the year lenses), drawn hollow behind. */
  ghost: number | null;
  lit: boolean;
  /** After today: nothing has fallen due yet. */
  future: boolean;
}

type LensFacts =
  | {
      lens: 'month';
      paidMinor: number;
      paidBills: number;
      toPayMinor: number;
      toPayBills: number;
      overdue: number;
      toCome: number;
    }
  | {
      lens: 'year';
      aMonthMinor: number;
      highest: { month: string; minor: number } | null;
      lastYearMinor: number;
    }
  | { lens: 'fy'; aMonthMinor: number; expectedMinor: number; lastYearMinor: number };

interface LensFigure {
  lens: Lens;
  period: string;
  /** The financial year's label ("2026–27"); the year's and month's are theirs to word. */
  label: string;
  start: string;
  end: string;
  totalMinor: number;
  bills: number;
  /** Against the period before, to the same point: a fraction, or null with nothing to compare. */
  change: { pct: number; dir: 'same' | 'up' | 'down' } | null;
  bars: LensBar[];
  prev: string;
  /** Up to the period after this one; null beyond. */
  next: string | null;
  facts: LensFacts;
}

/** The ring that says most about the service (SCOPE-services.md §3b). */
type TileRing =
  | { kind: 'overdue'; days: number }
  | { kind: 'usage'; perDay: number; unit: string; limitPerDay: number | null }
  | { kind: 'instalments'; paid: number; of: number }
  | { kind: 'shares'; paid: number; total: number }
  | { kind: 'days'; days: number }
  | { kind: 'paid' }
  /** The year lenses: bills paid of the bills due so far. */
  | { kind: 'bills'; paid: number; total: number }
  | { kind: 'icon' };

/** A line or a fact on a tile, in raw numbers; the page words it. */
export type TileText =
  | { kind: 'samePrice'; dueDate: string | null }
  | { kind: 'usageOfLimit'; pct: number }
  | { kind: 'usage'; perDay: number; unit: string }
  | { kind: 'vsLastYear'; pct: number; what: 'cost' | 'usage' }
  | { kind: 'instalmentsLeft'; leftMinor: number; totalMinor: number }
  | { kind: 'nextInstalment'; dueDate: string }
  | { kind: 'nothing' }
  | { kind: 'next'; dueDate: string; minor: number | null; name: string | null }
  | { kind: 'yourShare'; minor: number; paid: boolean }
  | { kind: 'paid'; date: string }
  | { kind: 'bills'; count: number }
  | { kind: 'highest'; month: string; minor: number }
  | { kind: 'lastYear'; minor: number }
  | { kind: 'aMonth'; minor: number }
  | { kind: 'taxReceipt'; minor: number }
  | { kind: 'unusual'; pct: number };

export interface ServiceTile {
  key: string;
  mine: boolean;
  kind: 'service' | 'group';
  /** One of the everyday bills, or the Home & Property main service: the Essentials card (SCOPE-redesign-2.md §4). */
  essential: boolean;
  href: string;
  name: string;
  /** Under the name, only where it differs from the name (null otherwise). */
  provider: string | null;
  /** A main service: how many services (or vehicles) it holds. */
  count: number | null;
  category: GroupedCategory | null;
  icon: string;
  colour: string;
  chip:
    | { kind: BillStatus['key']; days: number; dueDate: string }
    | { kind: 'unusual' }
    | { kind: 'expected'; dueDate: string }
    | { kind: 'none' };
  ring: TileRing;
  /** The lens's figure, or null for a dash. */
  figureMinor: number | null;
  /** True when the figure is an expectation, not a bill in. */
  approx: boolean;
  line: TileText;
  fact: TileText;
  /** The year lenses: a bar a month. */
  bars: number[] | null;
  /** Nothing due in the lens: drawn quieter, last in its group. */
  quiet: boolean;
}

interface TileSection {
  group: NavGroup | null;
  totalMinor: number;
  tiles: ServiceTile[];
}

export interface ServicesPage {
  lens: Lens;
  periods: Periods;
  figures: Record<Lens, LensFigure>;
  /** The household's groups in their order, then the services in none. */
  sections: TileSection[];
  /** My Services: the viewer's own groups, then their own in none. */
  mine: TileSection[];
}

/** The periods the page opens on: today's month, year and financial year. */
export function defaultPeriods(today: string, fiscalYearStartMonth: number): Periods {
  return {
    month: today.slice(0, 7),
    year: today.slice(0, 4),
    fy: fiscalYearBounds(today, fiscalYearStartMonth).start.slice(0, 4),
  };
}

/** The twelve months of a financial year starting in `fyStart` ("2026") with its start month. */
function fyMonths(fyStart: string, startMonth: number): string[] {
  const first = `${fyStart}-${String(startMonth).padStart(2, '0')}`;
  return Array.from({ length: 12 }, (_, i) => addMonths(first, i));
}

/** What fell due in each month, per service and in all (each instalment in its own month). */
function dueByMonth(
  bills: BillListItem[],
  months: string[],
): { total: Map<string, number>; byService: Map<string, Map<string, number>> } {
  const total = new Map(months.map((m) => [m, 0]));
  const byService = new Map<string, Map<string, number>>();
  for (const b of bills)
    for (const p of dueParts(b)) {
      const m = p.dueDate.slice(0, 7);
      if (!total.has(m)) continue;
      total.set(m, total.get(m)! + p.amountMinor);
      const row = byService.get(b.serviceId) ?? new Map(months.map((x) => [x, 0]));
      row.set(m, row.get(m)! + p.amountMinor);
      byService.set(b.serviceId, row);
    }
  return { total, byService };
}

const change = (now: number, before: number): LensFigure['change'] =>
  before > 0
    ? {
        pct: now / before - 1,
        dir: Math.abs(now / before - 1) < SAME_BAND ? 'same' : now > before ? 'up' : 'down',
      }
    : null;

export function servicesPage(
  hh: Household,
  me: Member,
  today: string,
  lens: Lens = 'month',
  periods: Periods = defaultPeriods(today, hh.fiscalYearStartMonth),
  db: Db = getDb(),
): ServicesPage {
  const thisMonth = today.slice(0, 7);
  const split = hh.splitMode === 'shared';
  const bills = listBills(hh.id, { viewer: me.id }, db);
  const services = listServices(hh.id, { viewer: me.id, includeInactive: true }, db);
  const usage = householdUsage(hh.id, db);
  const usageOf = (id: string) => usage.find((u) => u.serviceId === id) ?? null;

  // ---- the three lenses ----
  const monthView = servicesMonth(hh, me.id, today, periods.month, 'all', db);
  const monthItems = new Map<string, MonthItem>();
  for (const e of monthView.entries)
    if (e.kind === 'service') monthItems.set(e.item.service.id, e.item);
    else for (const i of e.items) monthItems.set(i.service.id, i);
  const monthFigure = ((): LensFigure => {
    const months = lastMonths(periods.month, 12);
    const { total } = dueByMonth(bills, [...lastMonths(periods.month, 13)]);
    const parts = [...monthItems.values()].flatMap((i) => i.bills);
    const paid = parts.filter((p) => p.status.key === 'paid');
    const toPay = parts.filter((p) => p.status.key !== 'paid');
    return {
      lens: 'month',
      period: periods.month,
      label: periods.month,
      ...monthBounds(periods.month),
      totalMinor: monthView.totalMinor,
      bills: parts.length,
      change: change(monthView.totalMinor, total.get(addMonths(periods.month, -1)) ?? 0),
      bars: months.map((m) => ({
        month: m,
        minor: total.get(m) ?? 0,
        ghost: null,
        lit: m === periods.month,
        future: m > thisMonth,
      })),
      prev: monthView.prev,
      next: monthView.next,
      facts: {
        lens: 'month',
        paidMinor: paid.reduce((s, p) => s + p.amountMinor, 0),
        paidBills: paid.length,
        toPayMinor: toPay.reduce((s, p) => s + p.amountMinor, 0),
        toPayBills: toPay.length,
        overdue: parts.filter((p) => p.status.key === 'overdue').length,
        toCome: monthView.counts.toCome,
      },
    };
  })();

  /** A year of months, the year before it behind, to the same point as today when it's the current year. */
  const yearFigure = (lens: 'year' | 'fy', months: string[], period: string, label: string) => {
    const before = months.map((m) => addMonths(m, -12));
    const { total } = dueByMonth(bills, [...before, ...months]);
    const sofar = months.filter((m) => m <= thisMonth);
    const sum = (ms: string[]) => ms.reduce((s, m) => s + (total.get(m) ?? 0), 0);
    const totalMinor = sum(sofar);
    const elapsed = Math.max(1, sofar.length);
    const lastYearMinor = sum(before);
    const start = monthBounds(months[0]!).start;
    const end = monthBounds(months[11]!).end;
    const partsIn = bills
      .flatMap(dueParts)
      .filter((p) => p.dueDate >= start && p.dueDate <= end && p.dueDate.slice(0, 7) <= thisMonth);
    const highest = sofar
      .map((m) => ({ month: m, minor: total.get(m) ?? 0 }))
      .sort((a, b) => b.minor - a.minor)[0];
    const facts: LensFacts =
      lens === 'year'
        ? {
            lens,
            aMonthMinor: Math.round(totalMinor / elapsed),
            highest: highest && highest.minor > 0 ? highest : null,
            lastYearMinor,
          }
        : {
            lens,
            aMonthMinor: Math.round(totalMinor / elapsed),
            expectedMinor: totalMinor + expectedAhead(months.filter((m) => m > thisMonth)),
            lastYearMinor,
          };
    const n = Number(period);
    return {
      lens,
      period,
      label,
      start,
      end,
      totalMinor,
      bills: partsIn.length,
      change: change(totalMinor, sum(before.slice(0, sofar.length))),
      bars: months.map((m, i) => ({
        month: m,
        minor: total.get(m) ?? 0,
        ghost: total.get(before[i]!) ?? 0,
        lit: m === thisMonth,
        future: m > thisMonth,
      })),
      prev: String(n - 1),
      // Up to the year that has begun; none beyond.
      next: addMonths(months[0]!, 12) > thisMonth ? null : String(n + 1),
      facts,
    } satisfies LensFigure;
  };
  /** What is still expected to fall due in the months ahead (within the lens). */
  const expectedAhead = (months: string[]): number => {
    if (!months.length) return 0;
    const until = months[months.length - 1]!;
    const first = monthBounds(months[0]!).start;
    return services
      .filter((s) => s.isActive && !s.cancelledAt)
      .flatMap((s) =>
        expectedBills(
          s,
          bills.filter((b) => b.serviceId === s.id),
          until,
          perDayFallback(hh.id, s, today, db),
        ),
      )
      .filter((e) => e.dueDate > today && e.dueDate >= first)
      .reduce((s, e) => s + e.amountMinor, 0);
  };
  const yearMonths = Array.from({ length: 12 }, (_, i) => addMonths(`${periods.year}-01`, i));
  const fyMs = fyMonths(periods.fy, hh.fiscalYearStartMonth);
  const figures: Record<Lens, LensFigure> = {
    month: monthFigure,
    year: yearFigure('year', yearMonths, periods.year, periods.year),
    fy: yearFigure(
      'fy',
      fyMs,
      periods.fy,
      fiscalYearBounds(monthBounds(fyMs[0]!).start, hh.fiscalYearStartMonth).label,
    ),
  };

  // ---- the tiles ----
  const lensMonths = lens === 'month' ? [periods.month] : lens === 'year' ? yearMonths : fyMs;
  const lensStart = monthBounds(lensMonths[0]!).start;
  const lensEnd = monthBounds(lensMonths[lensMonths.length - 1]!).end;
  const inLens = (b: BillListItem) =>
    dueParts(b).filter((p) => p.dueDate >= lensStart && p.dueDate <= lensEnd);
  const { byService } = dueByMonth(bills, lensMonths);
  const monthsSoFar = lensMonths.filter((m) => m <= thisMonth).length;
  const sharesOf = (b: BillListItem) =>
    b.shares.filter(
      (s) => (s.instalment || 0) === (dueNow(b).seq ?? 0) && s.memberId !== b.service.payerMemberId,
    );
  const myShare = (b: BillListItem) =>
    b.shares.find((s) => (s.instalment || 0) === (dueNow(b).seq ?? 0) && s.memberId === me.id) ??
    null;
  const usageLine = (u: UsageComparison | null, svc: ServiceWithType): TileText | null => {
    if (!u || u.latest.perDay === null) return null;
    if (u.limit) return { kind: 'usageOfLimit', pct: u.latest.perDay / u.limit.perDay };
    return { kind: 'usage', perDay: u.latest.perDay, unit: u.unit ?? svc.usageUnit ?? '' };
  };

  const serviceTile = (svc: ServiceWithType, mine: boolean): ServiceTile => {
    const own = bills.filter((b) => b.serviceId === svc.id);
    const u = usageOf(svc.id);
    const base = {
      key: navKey({ category: null, typeSlug: null, services: [svc] }, mine),
      mine,
      kind: 'service' as const,
      essential: isEssential(svc.type),
      href: `/services/${svc.id}`,
      name: svc.name,
      provider: svc.provider && svc.provider !== svc.name ? svc.provider : null,
      count: null,
      category: null,
      icon: svc.type.icon,
      colour: svc.colour,
    };
    if (lens === 'month') {
      const i = monthItems.get(svc.id);
      const parts = i?.bills ?? [];
      const status = i?.status ?? null;
      const dueBill = parts.find((p) => p.status.key !== 'paid')?.bill ?? parts[0]?.bill ?? null;
      const unusual = parts.find((p) => p.bill.isAnomaly)?.bill ?? null;
      const expectedThisMonth =
        i?.expected && i.expected.dueDate.slice(0, 7) === periods.month ? i.expected : null;
      const chip: ServiceTile['chip'] = status
        ? status.key === 'overdue' || !unusual
          ? { kind: status.key, days: status.days, dueDate: status.dueDate }
          : { kind: 'unusual' }
        : expectedThisMonth
          ? { kind: 'expected', dueDate: expectedThisMonth.dueDate }
          : { kind: 'none' };
      const ring: TileRing = (() => {
        if (status?.key === 'overdue') return { kind: 'overdue', days: -status.days };
        if (u && u.latest.perDay !== null)
          return {
            kind: 'usage',
            perDay: u.latest.perDay,
            unit: u.unit ?? svc.usageUnit ?? '',
            limitPerDay: u.limit?.perDay ?? null,
          };
        if (dueBill && paysByInstalments(dueBill))
          return {
            kind: 'instalments',
            paid: dueBill.instalments.filter((x) => x.paidToProviderAt).length,
            of: dueBill.instalments.length,
          };
        if (split && dueBill && !dueBill.ownerMemberId && status && status.key !== 'paid') {
          const list = sharesOf(dueBill);
          if (list.length)
            return {
              kind: 'shares',
              paid: list.filter((s) => s.paidAt).length,
              total: list.length,
            };
        }
        if (status && status.key !== 'paid') return { kind: 'days', days: status.days };
        if (status?.key === 'paid') return { kind: 'paid' };
        return { kind: 'icon' };
      })();
      const fixed = fixedPrice(own) !== null;
      const line: TileText =
        unusual && u?.lastYear?.cost.pct != null
          ? { kind: 'unusual', pct: u.lastYear.cost.pct }
          : dueBill && paysByInstalments(dueBill)
            ? {
                kind: 'instalmentsLeft',
                leftMinor: dueBill.instalments
                  .filter((x) => !x.paidToProviderAt)
                  .reduce((s, x) => s + x.amountMinor, 0),
                totalMinor: dueBill.amountMinor,
              }
            : (usageLine(u, svc) ??
              (fixed
                ? {
                    kind: 'samePrice',
                    dueDate: status && status.key !== 'paid' ? status.dueDate : null,
                  }
                : !parts.length
                  ? i?.expected
                    ? {
                        kind: 'next',
                        dueDate: i.expected.dueDate,
                        minor: i.expected.amountMinor,
                        name: null,
                      }
                    : { kind: 'nothing' }
                  : i?.change && i.change.dir !== 'same'
                    ? { kind: 'vsLastYear', pct: i.change.pct, what: 'cost' }
                    : {
                        kind: 'samePrice',
                        dueDate: status && status.key !== 'paid' ? status.dueDate : null,
                      }));
      const share = dueBill ? myShare(dueBill) : null;
      const fact: TileText =
        dueBill &&
        paysByInstalments(dueBill) &&
        dueBill.instalments.some((x) => !x.paidToProviderAt)
          ? {
              kind: 'nextInstalment',
              dueDate: dueBill.instalments.find((x) => !x.paidToProviderAt)!.dueDate,
            }
          : split && share && !dueBill?.ownerMemberId
            ? { kind: 'yourShare', minor: share.amountMinor, paid: !!share.paidAt }
            : u?.lastYear?.cost.pct != null && line.kind !== 'unusual'
              ? { kind: 'vsLastYear', pct: u.lastYear.cost.pct, what: 'cost' }
              : status?.key === 'paid' && parts[0]?.status.dueDate
                ? { kind: 'paid', date: parts[0].status.dueDate }
                : i?.expected
                  ? {
                      kind: 'next',
                      dueDate: i.expected.dueDate,
                      minor: i.expected.amountMinor,
                      name: null,
                    }
                  : mine && svc.typeSlug === 'donations'
                    ? { kind: 'taxReceipt', minor: own.reduce((s, b) => s + b.amountMinor, 0) }
                    : { kind: 'nothing' };
      return {
        ...base,
        chip,
        ring,
        figureMinor: parts.length
          ? (i?.amountMinor ?? 0)
          : (expectedThisMonth?.amountMinor ?? null),
        approx: !parts.length && !!expectedThisMonth?.amountMinor,
        line,
        fact,
        bars: null,
        quiet: !parts.length,
      };
    }
    // The year lenses: the service over the lens's months so far.
    const row = byService.get(svc.id);
    const months = lensMonths.map((m) => row?.get(m) ?? 0);
    const parts = own.flatMap(inLens).filter((p) => p.dueDate.slice(0, 7) <= thisMonth);
    const totalMinor = parts.reduce((s, p) => s + p.amountMinor, 0);
    const paid = parts.filter((p) => p.paidAt).length;
    const history = u ? usageHistory(hh.id, svc.id, db) : null;
    const inYear = history?.periods.filter(
      (p) => p.periodEnd >= lensStart && p.periodEnd <= lensEnd && p.perDay !== null,
    );
    const avgPerDay =
      inYear && inYear.length ? inYear.reduce((s, p) => s + p.perDay!, 0) / inYear.length : null;
    const beforeStart = monthBounds(addMonths(lensMonths[0]!, -12)).start;
    const beforeEnd = monthBounds(
      addMonths(lensMonths[monthsSoFar - 1] ?? lensMonths[0]!, -12),
    ).end;
    const lastYearMinor = own
      .flatMap(dueParts)
      .filter((p) => p.dueDate >= beforeStart && p.dueDate <= beforeEnd)
      .reduce((s, p) => s + p.amountMinor, 0);
    const vs = change(totalMinor, lastYearMinor);
    const worst = parts.find((p) => !p.paidAt && p.dueDate < today);
    const overBy = worst
      ? Math.round((Date.parse(today) - Date.parse(worst.dueDate)) / 86_400_000)
      : 0;
    const ring: TileRing = worst
      ? { kind: 'overdue', days: overBy }
      : avgPerDay !== null
        ? {
            kind: 'usage',
            perDay: avgPerDay,
            unit: u?.unit ?? svc.usageUnit ?? '',
            limitPerDay: u?.limit?.perDay ?? null,
          }
        : parts.length
          ? { kind: 'bills', paid, total: parts.length }
          : { kind: 'icon' };
    const chip: ServiceTile['chip'] = worst
      ? { kind: 'overdue', days: -overBy, dueDate: worst.dueDate }
      : { kind: 'none' };
    return {
      ...base,
      chip,
      ring,
      figureMinor: parts.length ? totalMinor : null,
      approx: false,
      line: { kind: 'bills', count: parts.length },
      fact: vs
        ? { kind: 'vsLastYear', pct: vs.pct, what: 'cost' }
        : months.some((m) => m > 0)
          ? {
              kind: 'highest',
              ...lensMonths
                .map((m, k) => ({ month: m, minor: months[k]! }))
                .sort((a, b) => b.minor - a.minor)[0]!,
            }
          : { kind: 'nothing' },
      bars: months,
      quiet: !parts.length,
    };
  };

  /** A main service: its services added up, led by the most pressing of them. */
  const groupTile = (
    g: ReturnType<typeof groupServices<ServiceWithType>>[number],
    mine: boolean,
  ): ServiceTile => {
    const tiles = g.services.map((s) => serviceTile(s, mine));
    const rank: Record<string, number> = {
      overdue: 0,
      today: 1,
      tomorrow: 2,
      soon: 3,
      due: 4,
      unusual: 5,
      expected: 6,
      paid: 7,
      none: 8,
    };
    const lead = [...tiles].sort((a, b) => rank[a.chip.kind]! - rank[b.chip.kind]!)[0];
    const figures = tiles.map((t) => t.figureMinor).filter((x): x is number => x !== null);
    return {
      key: navKey(g, mine),
      mine,
      kind: 'group',
      essential: g.category === 'home',
      href: g.category ? `/services/category/${g.category}` : `/services/group/${g.typeSlug}`,
      name: g.label,
      provider: null,
      count: g.services.length,
      category: g.category,
      icon: g.icon,
      colour: g.colour,
      chip: lead?.chip ?? { kind: 'none' },
      ring:
        lead && lead.ring.kind !== 'usage' && lead.ring.kind !== 'shares'
          ? lead.ring
          : lead && lead.chip.kind !== 'none'
            ? lead.ring
            : { kind: 'icon' },
      figureMinor: figures.length ? figures.reduce((s, x) => s + x, 0) : null,
      approx:
        tiles.some((t) => t.approx) && !tiles.some((t) => !t.approx && t.figureMinor !== null),
      line: lead && lead.chip.kind !== 'none' ? lead.line : { kind: 'nothing' },
      fact:
        lead && lead.chip.kind !== 'none'
          ? { ...lead.fact }
          : (() => {
              type Next = Extract<TileText, { kind: 'next' }>;
              const nexts: Next[] = [];
              for (const t of tiles) {
                const n = t.fact.kind === 'next' ? t.fact : t.line.kind === 'next' ? t.line : null;
                if (n) nexts.push({ ...n, name: t.name });
              }
              nexts.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
              return nexts[0] ?? { kind: 'nothing' };
            })(),
      bars:
        lens === 'month'
          ? null
          : lensMonths.map((_, k) => tiles.reduce((s, t) => s + (t.bars?.[k] ?? 0), 0)),
      quiet: tiles.every((t) => t.quiet),
    };
  };

  const layout = getNavLayout(me, db);
  const toTiles = (list: ServiceWithType[], mine: boolean) =>
    groupServices(list).map((g) =>
      !g.category && !g.typeSlug ? serviceTile(g.services[0]!, mine) : groupTile(g, mine),
    );
  const household = toTiles(
    services.filter((s) => !s.ownerMemberId && (s.isActive || monthItems.has(s.id))),
    false,
  );
  const own = toTiles(
    services.filter((s) => s.ownerMemberId === me.id && (s.isActive || monthItems.has(s.id))),
    true,
  );
  const essential = (t: ServiceTile) => t.essential;
  const toSection = (sec: { group: NavGroup | null; entries: ServiceTile[] }): TileSection => ({
    group: sec.group,
    totalMinor: sec.entries.reduce((s, t) => s + (t.figureMinor ?? 0), 0),
    // The quiet ones last in their group (V-D3).
    tiles: [...sec.entries.filter((t) => !t.quiet), ...sec.entries.filter((t) => t.quiet)],
  });
  return {
    lens,
    periods,
    figures,
    sections: arrange(household, (t) => t.key, layout, essential)
      .map(toSection)
      .filter((s) => s.tiles.length),
    mine: arrangeMine(own, (t) => t.key, layout)
      .map(toSection)
      .filter((s) => s.tiles.length),
  };
}
