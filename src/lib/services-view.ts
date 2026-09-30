import type { Household } from '@/db/schema';
import { getDb, type Db } from '@/db/client';
import { closestYearBefore, costPerDay, SAME_BAND } from '@/lib/averages';
import { billDate } from '@/lib/bill-month';
import { billDue, type BillStatus } from '@/lib/bill-status';
import { listBills, type BillListItem } from '@/lib/bills';
import { addDays, daysInclusive, toUtcMs } from '@/lib/dates';
import { paysByInstalments } from '@/lib/instalments';
import { addMonths, monthBounds } from '@/lib/periods';
import { estimatePerDay, nextBillGuess } from '@/lib/projections';
import type { GroupedCategory } from '@/lib/service-categories';
import {
  chargedAfterCancel,
  getCustomSplits,
  groupServices,
  listServices,
  type ServiceWithType,
} from '@/lib/services';

/**
 * The Services page: one ribbon per service, a year of its bills as blocks
 * on a 13-month window (eleven months back to the end of next month), the
 * last twelve months' total, and the facts its sentence is made of. Pure
 * numbers; the page words them.
 */
interface RibbonBlock {
  billId: string;
  periodStart: string;
  periodEnd: string;
  amountMinor: number;
  status: BillStatus;
  unusual: boolean;
  /** The period began before the window: the block runs off its left edge. */
  clipped: boolean;
  /** Position on the window, in percent. */
  left: number;
  width: number;
}

export interface ServiceRibbon {
  id: string;
  typeSlug: string;
  name: string;
  provider: string;
  icon: string;
  colour: string;
  personal: boolean;
  /** The last twelve months' bills, by the month each belongs to. */
  yearMinor: number;
  yearBills: number;
  blocks: RibbonBlock[];
  latest: { billId: string; amountMinor: number; status: BillStatus } | null;
  /** Latest bill's cost per day against the same time last year (a fraction), when there is one. */
  vsLastYear: number | null;
  unusual: boolean;
  /** Paying by instalments: which one is due next. */
  instalment: { n: number; of: number; dueDate: string } | null;
  /** Percentages, largest first, when the split is by percentage. */
  percentages: number[] | null;
  /** The next bill's expected due date, when the cadence allows a guess. */
  nextDue: string | null;
  /** A sub-service someone cancelled: when, and by whom (a member id). */
  cancelled: { at: string; by: string | null } | null;
  /** Bills dated after it was cancelled (it's still charging). */
  afterCancel: number;
}

/**
 * The ribbons in list order, a main service's sub-services gathered under
 * it (Subscriptions → Netflix, Spotify) with their year added up; any other
 * service is a group of one with no type.
 */
export interface RibbonGroup {
  typeSlug: string | null;
  /** Vehicles or Health: a category that is a main service (see groupServices). */
  category: GroupedCategory | null;
  label: string;
  icon: string;
  colour: string;
  yearMinor: number;
  ribbons: ServiceRibbon[];
}

export interface ServicesView {
  window: { start: string; end: string; today: number; months: { label: string; left: number }[] };
  services: ServiceRibbon[];
  groups: RibbonGroup[];
}

export type ServiceScope = 'all' | 'household' | 'mine';

export function servicesView(
  hh: Household,
  memberId: string,
  today: string,
  scope: ServiceScope = 'all',
  db: Db = getDb(),
  /** Only this main service's sub-services, cancelled ones included (its own page). */
  typeSlug: string | null = null,
): ServicesView {
  const month = today.slice(0, 7);
  const start = monthBounds(addMonths(month, -11)).start;
  const end = addDays(monthBounds(addMonths(month, 1)).end, 1);
  const t0 = toUtcMs(start);
  const t1 = toUtcMs(end);
  const x = (d: string) => Math.max(0, Math.min(100, ((toUtcMs(d) - t0) / (t1 - t0)) * 100));
  const months = Array.from({ length: 13 }, (_, i) => ({
    label: addMonths(month, i - 11),
    left: (i / 13) * 100,
  }));
  const yearStart = addDays(today, -365);

  const services = listServices(
    hh.id,
    {
      ...(scope === 'mine'
        ? { owner: memberId }
        : scope === 'household'
          ? {}
          : { viewer: memberId }),
      includeInactive: !!typeSlug,
    },
    db,
  )
    .filter((svc) => !typeSlug || svc.typeSlug === typeSlug)
    // Still going first (in list order), then the cancelled ones, latest first.
    .sort((a, b) =>
      a.cancelledAt && b.cancelledAt
        ? b.cancelledAt.localeCompare(a.cancelledAt)
        : Number(!!a.cancelledAt) - Number(!!b.cancelledAt),
    );
  const ribbons = services.map((svc): ServiceRibbon => {
    const bills = listBills(hh.id, { serviceId: svc.id }, db);
    const latest = bills[0];
    const inYear = bills.filter((b) => billDate(b) >= yearStart && billDate(b) <= today);
    const blocks = bills
      .filter((b) => b.periodEnd >= start && b.periodStart < end)
      .map((b): RibbonBlock => {
        const due = billDue(b, today);
        const l = x(b.periodStart);
        const r = x(addDays(b.periodEnd, 1));
        return {
          billId: b.id,
          periodStart: b.periodStart,
          periodEnd: b.periodEnd,
          amountMinor: due.amountMinor,
          status: due.status,
          unusual: b.isAnomaly,
          clipped: b.periodStart < start,
          left: l,
          width: Math.max(r - l, 0.6),
        };
      });
    const lastYear = latest ? closestYearBefore(latest, bills.slice(1)) : undefined;
    const vsLastYear =
      latest && lastYear && costPerDay(lastYear) > 0
        ? costPerDay(latest) / costPerDay(lastYear) - 1
        : null;
    const due = latest ? billDue(latest, today) : null;
    return {
      id: svc.id,
      typeSlug: svc.typeSlug,
      name: svc.name,
      provider: svc.provider,
      icon: svc.type.icon,
      colour: svc.colour,
      personal: !!svc.ownerMemberId,
      yearMinor: inYear.reduce((s, b) => s + b.amountMinor, 0),
      yearBills: inYear.length,
      blocks,
      latest:
        latest && due
          ? { billId: latest.id, amountMinor: due.amountMinor, status: due.status }
          : null,
      vsLastYear,
      unusual: !!latest?.isAnomaly,
      instalment:
        latest && due?.instalment && paysByInstalments(latest) && due.status.key !== 'paid'
          ? { n: due.instalment.n, of: due.instalment.of, dueDate: due.status.dueDate }
          : null,
      percentages: percentagesOf(hh.id, svc, db),
      nextDue: svc.cancelledAt ? null : nextDueGuess(svc, bills, today),
      cancelled: svc.cancelledAt ? { at: svc.cancelledAt, by: svc.cancelledByMemberId } : null,
      afterCancel: bills.filter((b) => chargedAfterCancel(svc, b)).length,
    };
  });
  const byId = new Map(ribbons.map((r) => [r.id, r]));
  const groups = groupServices(services).map((g): RibbonGroup => {
    const rs = g.services.map((svc) => byId.get(svc.id)!);
    return {
      typeSlug: g.typeSlug,
      category: g.category,
      label: g.label,
      icon: g.icon,
      colour: g.colour,
      yearMinor: rs.reduce((sum, r) => sum + r.yearMinor, 0),
      ribbons: rs,
    };
  });
  return {
    window: { start, end, today: x(today), months },
    services: ribbons,
    groups,
  };
}

function percentagesOf(householdId: string, svc: ServiceWithType, db: Db): number[] | null {
  if (svc.splitMode !== 'percent' || svc.ownerMemberId) return null;
  const weights = Object.values(getCustomSplits(householdId, svc.id, db)).filter((w) => w > 0);
  const total = weights.reduce((s, w) => s + w, 0);
  if (!total) return null;
  return weights.map((w) => Math.round((w * 100) / total)).sort((a, b) => b - a);
}

/** When the next bill is expected to be due, from the cadence and the latest bill. */
function nextDueGuess(svc: ServiceWithType, bills: BillListItem[], today: string): string | null {
  const latest = bills[0];
  if (!latest || svc.cadence === 'irregular') return null;
  const est = estimatePerDay(bills, today.slice(0, 7));
  const next = nextBillGuess(latest, svc.cadence, est.perDay);
  if (!next || next.dueDate < today) return null;
  return next.dueDate;
}

/** A change reads as level within the shared 2% band. */
export const isLevel = (f: number): boolean => Math.abs(f) < SAME_BAND;

/** Days a bill's period covers, for the ribbons' tooltips. */
export const periodDays = (b: { periodStart: string; periodEnd: string }): number =>
  daysInclusive(b.periodStart, b.periodEnd);
