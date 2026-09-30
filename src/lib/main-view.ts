import type { Asset, Household, ServiceType } from '@/db/schema';
import { getDb, type Db } from '@/db/client';
import { canEditAsset, listAssets } from '@/lib/assets';
import { listBills, type BillListItem } from '@/lib/bills';
import { addDays } from '@/lib/dates';
import { mainOverview, seriesColours, type MainOverview } from '@/lib/main-overview';
import { upcomingCharge, type ExpectedCharge } from '@/lib/recurring';
import { dueParts } from '@/lib/services-month';
import { assetKindOf, type GroupedCategory } from '@/lib/service-categories';
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
      : s.type.category === where.category && !s.type.hasSubServices,
  );
  const bills = listBills(hh.id, { viewer: me.id }, db);
  const all = services.map((svc): ServiceCard => {
    const own = bills.filter((b) => b.serviceId === svc.id);
    return {
      service: svc,
      bills: own,
      yearMinor: yearOf(own, today),
      upcoming: upcomingCharge(svc, own),
      afterCancel: own.filter((b) => chargedAfterCancel(svc, b)).length,
    };
  });
  const going = (c: ServiceCard) => c.service.isActive && !c.service.cancelledAt;
  const series = seriesColours(
    all.map((c) => ({ key: c.service.id, label: c.service.name, colour: c.service.colour })),
  );
  return {
    cards: all.filter(going),
    stopped: all
      .filter((c) => !going(c))
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
        services: going(c) ? [c.service] : [],
      })),
      series,
      seriesOf: (b) => b.serviceId,
      seriesOfService: (svc) => svc.id,
      today,
    }),
  };
}

interface VehicleCard {
  asset: Asset;
  /** May this member rename, remove or change it (canEditAsset)? */
  canEdit: boolean;
  /** Its bills of the kind picked (all kinds by default), newest first. */
  bills: BillListItem[];
  yearMinor: number;
}

export interface VehiclesView {
  cards: VehicleCard[];
  /** Vehicle bills not filed under a vehicle yet (of the kind picked). */
  waiting: BillListItem[];
  /** The kinds of vehicle bill the household has, with how many, for the filter chips. */
  kinds: { type: ServiceType; bills: number }[];
  /** The kind picked (a type slug), or null for every kind. */
  kind: string | null;
  yearMinor: number;
  /** The figures, chart and year ahead above the cards: one series per kind, a row per vehicle. */
  overview: MainOverview;
}

/**
 * Vehicles: a card per vehicle holding its bills of every kind (rego,
 * insurance, roadside, servicing), or of one kind when one is picked, and the
 * bills waiting for a vehicle. Every vehicle is listed, with bills or not.
 */
export function vehiclesView(
  hh: Household,
  me: { id: string; role: string },
  today: string,
  kind: string | null = null,
  db: Db = getDb(),
): VehiclesView {
  const types = listServiceTypes(db).filter((ty) => assetKindOf(ty.category));
  const every = listBills(hh.id, { viewer: me.id }, db).filter((b) =>
    assetKindOf(b.service.type.category),
  );
  const services = listServices(hh.id, { viewer: me.id, includeInactive: true }, db);
  const kinds = types
    .map((type) => ({ type, bills: every.filter((b) => b.service.typeSlug === type.slug).length }))
    .filter((k) => k.bills > 0 || services.some((s) => s.typeSlug === k.type.slug));
  const picked = kinds.some((k) => k.type.slug === kind) ? kind : null;
  const bills = picked ? every.filter((b) => b.service.typeSlug === picked) : every;
  const cards = listAssets(hh.id, { kind: 'vehicle', viewer: me.id }, db).map((a) => {
    const own = bills.filter((b) => b.assetId === a.id);
    return { asset: a, canEdit: canEditAsset(me, a), bills: own, yearMinor: yearOf(own, today) };
  });
  const svcById = new Map(services.map((s) => [s.id, s]));
  return {
    cards,
    overview: mainOverview({
      rows: cards.map((c) => ({
        key: c.asset.id,
        label: c.asset.name,
        bills: c.bills,
        services: [...new Set(c.bills.map((b) => b.serviceId))]
          .map((id) => svcById.get(id)!)
          .filter((svc) => svc && svc.isActive && !svc.cancelledAt),
      })),
      loose: bills.filter((b) => !b.assetId),
      series: kinds.map((k) => ({ key: k.type.slug, label: k.type.label, colour: k.type.colour })),
      seriesOf: (b) => b.service.typeSlug,
      seriesOfService: (svc) => svc.typeSlug,
      today,
    }),
    waiting: bills.filter((b) => !b.assetId),
    kinds,
    kind: picked,
    yearMinor: yearOf(bills, today),
  };
}
