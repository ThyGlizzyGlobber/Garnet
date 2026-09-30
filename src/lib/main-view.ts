import type { Asset, Household, ServiceType } from '@/db/schema';
import { getDb, type Db } from '@/db/client';
import { canEditAsset, listAssets } from '@/lib/assets';
import { listBills, type BillListItem } from '@/lib/bills';
import { addDays } from '@/lib/dates';
import { mainOverview, seriesColours, type MainOverview } from '@/lib/main-overview';
import { upcomingCharge, type ExpectedCharge } from '@/lib/recurring';
import { billDue, type BillStatus } from '@/lib/bill-status';
import { fixedMonthly, MONTHS_PER_BILL } from '@/lib/projections';
import { dueParts } from '@/lib/services-month';
import { assetKindOf, inMainCategory, type GroupedCategory } from '@/lib/service-categories';
import {
  chargedAfterCancel,
  listServices,
  listServiceTypes,
  type ServiceWithType,
} from '@/lib/services';

/**
 * The numbers behind a main service's page (Vehicles, Health, Lifestyle,
 * Subscriptions, Donations): one card per service (or per vehicle), each
 * holding its bills, newest first. The last twelve months are what was due
 * in them. The pages only word and lay them out.
 */

/** What was due in the last twelve months (bills, or their instalments, by due date). */
const yearOf = (bills: BillListItem[], today: string) => {
  const from = addDays(today, -365);
  return bills
    .flatMap(dueParts)
    .filter((p) => p.dueDate > from && p.dueDate <= today)
    .reduce((sum, p) => sum + p.amountMinor, 0);
};

export interface ServiceCard {
  service: ServiceWithType;
  bills: BillListItem[];
  yearMinor: number;
  /** A recurring service's next charge, not a bill yet. */
  upcoming: ExpectedCharge | null;
  /** Bills dated after it was cancelled (it's still charging). */
  afterCancel: number;
  /** Its own figures (for its tile): the last 12 months, a month's average, what's next. */
  overview: MainOverview;
  /** The colour it wears in the charts (distinct from its neighbours'). */
  colour: string;
}

export interface ServiceCardsView {
  /** Still going, in list order. */
  cards: ServiceCard[];
  /** Cancelled or stopped, latest first. */
  stopped: ServiceCard[];
  yearMinor: number;
  /** The figures, chart and year ahead above the cards: one series per service. */
  overview: MainOverview;
}

/**
 * A main service's services as cards: a category's (Health: Bupa, Ambulance
 * Victoria) or a type's sub-services (Subscriptions: Netflix, Spotify). Only
 * those this member sees; their own ones included.
 */
export function serviceCardsView(
  hh: Household,
  me: { id: string },
  where: { category: GroupedCategory } | { typeSlug: string },
  today: string,
  db: Db = getDb(),
): ServiceCardsView {
  const services = listServices(hh.id, { viewer: me.id, includeInactive: true }, db).filter((s) =>
    'typeSlug' in where
      ? s.typeSlug === where.typeSlug
      : s.type.category === where.category && inMainCategory(s.type),
  );
  const bills = listBills(hh.id, { viewer: me.id }, db);
  const going = (svc: ServiceWithType) => svc.isActive && !svc.cancelledAt;
  const series = seriesColours(
    services.map((svc) => ({ key: svc.id, label: svc.name, colour: svc.colour })),
  );
  const all = services.map((svc, i): ServiceCard => {
    const own = bills.filter((b) => b.serviceId === svc.id);
    return {
      service: svc,
      bills: own,
      yearMinor: yearOf(own, today),
      upcoming: upcomingCharge(svc, own),
      afterCancel: own.filter((b) => chargedAfterCancel(svc, b)).length,
      colour: series[i]!.colour,
      overview: mainOverview({
        rows: [{ key: svc.id, label: svc.name, bills: own, services: going(svc) ? [svc] : [] }],
        series: [series[i]!],
        seriesOf: () => svc.id,
        seriesOfService: () => svc.id,
        today,
      }),
    };
  });
  return {
    cards: all.filter((c) => going(c.service)),
    stopped: all
      .filter((c) => !going(c.service))
      .sort((a, b) =>
        (b.service.cancelledAt ?? b.service.updatedAt).localeCompare(
          a.service.cancelledAt ?? a.service.updatedAt,
        ),
      ),
    yearMinor: all.reduce((sum, c) => sum + c.yearMinor, 0),
    overview: mainOverview({
      rows: all.map((c) => ({
        key: c.service.id,
        label: c.service.name,
        bills: c.bills,
        services: going(c.service) ? [c.service] : [],
        stopped: !going(c.service),
      })),
      series,
      seriesOf: (b) => b.serviceId,
      seriesOfService: (svc) => svc.id,
      today,
    }),
  };
}

/** What was due on a vehicle's (or a set of vehicles') bills, by kind: see mainOverview. */
function vehicleOverview(
  rows: { key: string; label: string; bills: BillListItem[] }[],
  kinds: ServiceType[],
  services: Map<string, ServiceWithType>,
  today: string,
  loose: BillListItem[] = [],
): MainOverview {
  return mainOverview({
    rows: rows.map((r) => ({
      ...r,
      services: [...new Set(r.bills.map((b) => b.serviceId))]
        .map((id) => services.get(id))
        .filter((svc): svc is ServiceWithType => !!svc && svc.isActive && !svc.cancelledAt),
    })),
    loose,
    series: kinds.map((k) => ({ key: k.slug, label: k.label, colour: k.colour })),
    seriesOf: (b) => b.service.typeSlug,
    seriesOfService: (svc) => svc.typeSlug,
    today,
  });
}

/** The vehicle kinds of bill (Registration, Car insurance…), and the member's vehicle bills. */
function vehicleData(householdId: string, memberId: string, db: Db) {
  const types = listServiceTypes(db).filter((ty) => assetKindOf(ty.category));
  const bills = listBills(householdId, { viewer: memberId }, db).filter((b) =>
    assetKindOf(b.service.type.category),
  );
  const services = new Map(
    listServices(householdId, { viewer: memberId, includeInactive: true }, db).map((s) => [
      s.id,
      s,
    ]),
  );
  // Only the kinds the household has bills or services of.
  const kinds = types.filter(
    (ty) =>
      bills.some((b) => b.service.typeSlug === ty.slug) ||
      [...services.values()].some((s) => s.typeSlug === ty.slug),
  );
  return { bills, services, kinds };
}

interface VehicleCard {
  asset: Asset;
  /** May this member rename, remove or change it (canEditAsset)? */
  canEdit: boolean;
  /** Its bills, newest first. */
  bills: BillListItem[];
  /** Its own figures: the last twelve months by kind, what's next, the year ahead by kind. */
  overview: MainOverview;
}

export interface VehiclesView {
  cards: VehicleCard[];
  /** Vehicle bills not filed under a vehicle yet. */
  waiting: BillListItem[];
  /** All the vehicles together: a row per vehicle, one series per kind. */
  overview: MainOverview;
}

/**
 * Vehicles: every vehicle this member sees, each with its own figures, all of
 * them together, and the bills waiting for a vehicle.
 */
export function vehiclesView(
  hh: Household,
  me: { id: string; role: string },
  today: string,
  db: Db = getDb(),
): VehiclesView {
  const { bills, services, kinds } = vehicleData(hh.id, me.id, db);
  const cards = listAssets(hh.id, { kind: 'vehicle', viewer: me.id }, db).map((a) => {
    const own = bills.filter((b) => b.assetId === a.id);
    return {
      asset: a,
      canEdit: canEditAsset(me, a),
      bills: own,
      overview: vehicleOverview(
        kinds
          .map((k) => ({
            key: k.slug,
            label: k.label,
            bills: own.filter((b) => b.service.typeSlug === k.slug),
          }))
          .filter((r) => r.bills.length > 0),
        kinds,
        services,
        today,
      ),
    };
  });
  const waiting = bills.filter((b) => !b.assetId);
  return {
    cards,
    waiting,
    overview: vehicleOverview(
      cards.map((c) => ({ key: c.asset.id, label: c.asset.name, bills: c.bills })),
      kinds,
      services,
      today,
      waiting,
    ),
  };
}

export interface VehicleView {
  asset: Asset;
  canEdit: boolean;
  /** Its bills, newest first. */
  bills: BillListItem[];
  /** A row (and a series) per kind of bill it has. */
  overview: MainOverview;
  /** Each kind of bill it has: who it's with (the services' providers) and the latest. */
  kinds: { type: ServiceType; providers: string[]; latest: BillListItem; count: number }[];
}

/** One vehicle's own page, like a service's: its figures, charts and every bill. */
export function vehicleView(
  hh: Household,
  me: { id: string; role: string },
  assetId: string,
  today: string,
  db: Db = getDb(),
): VehicleView | null {
  const a = listAssets(hh.id, { kind: 'vehicle', viewer: me.id }, db).find((x) => x.id === assetId);
  if (!a) return null;
  const { bills, services, kinds } = vehicleData(hh.id, me.id, db);
  const own = bills.filter((b) => b.assetId === a.id);
  const rows = kinds
    .map((k) => ({
      key: k.slug,
      label: k.label,
      bills: own.filter((b) => b.service.typeSlug === k.slug),
    }))
    .filter((r) => r.bills.length > 0);
  return {
    asset: a,
    canEdit: canEditAsset(me, a),
    bills: own,
    overview: vehicleOverview(rows, kinds, services, today),
    kinds: rows.map((r) => ({
      type: kinds.find((k) => k.slug === r.key)!,
      providers: [...new Set(r.bills.map((b) => b.service.provider))],
      latest: r.bills[0]!,
      count: r.bills.length,
    })),
  };
}

export interface SubscriptionLine {
  service: ServiceWithType;
  colour: string;
  /** What it costs a month (a yearly plan over twelve), or null before its first bill. */
  monthlyMinor: number | null;
  /** Its next charge (expected), or the latest bill still to pay. */
  next: { dueDate: string; amountMinor: number | null; status: BillStatus | null } | null;
  latest: BillListItem | null;
  bills: number;
  /** Bills dated after it was cancelled (it's still charging). */
  afterCancel: number;
  /** Charged in the last 12 months. */
  yearMinor: number;
  /** Its own last twelve months and what's next (see mainOverview). */
  overview: MainOverview;
}

export interface SubscriptionsView {
  going: SubscriptionLine[];
  cancelled: SubscriptionLine[];
  /** Every subscription still going, a month. */
  monthlyMinor: number;
  yearMinor: number;
  /** All of them together: the year ahead, each month (see mainOverview). */
  overview: MainOverview;
}

/**
 * Subscriptions, built like Health: each one's price a month, its last
 * twelve months and its next charge, the cancelled ones after; and
 * together, what they cost a month, which take the most, and the year ahead.
 */
export function subscriptionsView(
  hh: Household,
  me: { id: string },
  today: string,
  db: Db = getDb(),
): SubscriptionsView {
  const v = serviceCardsView(hh, me, { typeSlug: 'subscriptions' }, today, db);
  const line = (c: ServiceCard): SubscriptionLine => {
    const latest = c.bills[0] ?? null;
    const months = MONTHS_PER_BILL[c.service.cadence];
    const monthlyMinor =
      fixedMonthly(c.service.cadence, c.bills) ??
      (latest && months ? Math.round(latest.amountMinor / months) : null);
    const open = latest ? billDue(latest, today) : null;
    const expected = c.overview.next;
    return {
      service: c.service,
      colour: c.colour,
      monthlyMinor,
      next:
        open && open.status.key !== 'paid'
          ? { dueDate: open.status.dueDate, amountMinor: open.amountMinor, status: open.status }
          : expected
            ? { dueDate: expected.dueDate, amountMinor: expected.amountMinor, status: null }
            : null,
      latest,
      bills: c.bills.length,
      afterCancel: c.afterCancel,
      yearMinor: c.yearMinor,
      overview: c.overview,
    };
  };
  const going = v.cards.map(line).sort((a, b) => (b.monthlyMinor ?? 0) - (a.monthlyMinor ?? 0));
  return {
    going,
    cancelled: v.stopped.map(line),
    monthlyMinor: going.reduce((sum, l) => sum + (l.monthlyMinor ?? 0), 0),
    yearMinor: v.yearMinor,
    overview: v.overview,
  };
}
