import type { Asset, AssetKind, Household, ServiceType } from '@/db/schema';
import { getDb, type Db } from '@/db/client';
import { canEditAsset, listAssets } from '@/lib/assets';
import { billDate } from '@/lib/bill-month';
import { listBills, type BillListItem } from '@/lib/bills';
import { addDays } from '@/lib/dates';
import { assetKindOf, type GroupedCategory } from '@/lib/service-categories';
import { byType, listServices, listServiceTypes, type ServiceWithType } from '@/lib/services';

/**
 * The numbers behind the Vehicles and Health pages (src/lib/assets.ts): every
 * vehicle or policy with what each kind of bill for it came to, and a
 * sub-service's bills (Registration) gathered under the vehicles they're for.
 * The last twelve months are bills whose own month falls in them (billDate).
 */

const inYear = (b: BillListItem, today: string) => {
  const d = billDate(b);
  return d > addDays(today, -365) && d <= today;
};
const yearOf = (bills: BillListItem[], today: string) =>
  bills.filter((b) => inYear(b, today)).reduce((sum, b) => sum + b.amountMinor, 0);

/** The bills of a category's services this member sees, newest first. */
function categoryBills(
  householdId: string,
  memberId: string,
  category: GroupedCategory,
  db: Db,
): BillListItem[] {
  return listBills(householdId, { viewer: memberId }, db).filter(
    (b) => b.service.type.category === category,
  );
}

interface AssetCard {
  asset: Asset;
  /** May this member rename, remove or change it (canEditAsset)? */
  canEdit: boolean;
  yearMinor: number;
  bills: number;
  /** Each kind of bill it has, in catalog order: its latest and the last twelve months. */
  lines: { type: ServiceType; latest: BillListItem; yearMinor: number; bills: number }[];
}

interface SubServiceLine {
  type: ServiceType;
  services: ServiceWithType[];
  yearMinor: number;
  /** Vehicles or policies with a bill of this type. */
  assets: number;
  /** Bills not filed under one yet. */
  waiting: number;
}

export interface CategoryView {
  category: GroupedCategory;
  kind: AssetKind;
  assets: AssetCard[];
  types: SubServiceLine[];
  yearMinor: number;
  waiting: number;
}

/** Vehicles (or Health): every vehicle or policy this member sees, and the sub-services. */
export function categoryView(
  hh: Household,
  me: { id: string; role: string },
  category: GroupedCategory,
  today: string,
  db: Db = getDb(),
): CategoryView {
  const kind = assetKindOf(category)!;
  const bills = categoryBills(hh.id, me.id, category, db);
  const types = listServiceTypes(db);
  const assets = listAssets(hh.id, { kind, viewer: me.id }, db).map((a): AssetCard => {
    const own = bills.filter((b) => b.assetId === a.id);
    return {
      asset: a,
      canEdit: canEditAsset(me, a),
      yearMinor: yearOf(own, today),
      bills: own.length,
      lines: types
        .filter((ty) => own.some((b) => b.service.typeSlug === ty.slug))
        .map((ty) => {
          const of = own.filter((b) => b.service.typeSlug === ty.slug);
          return { type: ty, latest: of[0]!, yearMinor: yearOf(of, today), bills: of.length };
        }),
    };
  });
  const services = listServices(hh.id, { viewer: me.id, includeInactive: true }, db).filter(
    (s) => s.type.category === category,
  );
  const lines = byType(services).map(({ type, services: svcs }): SubServiceLine => {
    const of = bills.filter((b) => b.service.typeSlug === type.slug);
    return {
      type,
      services: svcs,
      yearMinor: yearOf(of, today),
      assets: new Set(of.map((b) => b.assetId).filter(Boolean)).size,
      waiting: of.filter((b) => !b.assetId).length,
    };
  });
  return {
    category,
    kind,
    assets,
    types: lines,
    yearMinor: yearOf(bills, today),
    waiting: lines.reduce((n, l) => n + l.waiting, 0),
  };
}

interface AssetBills {
  asset: Asset;
  bills: BillListItem[];
  yearMinor: number;
}

export interface SubServiceView {
  type: ServiceType;
  category: GroupedCategory;
  kind: AssetKind;
  /** The vehicles or policies with a bill of this type, by name. */
  groups: AssetBills[];
  /** Bills of this type not filed under a vehicle or policy yet. */
  waiting: BillListItem[];
  /** Every vehicle or policy this member sees, to file a waiting bill under. */
  assets: Asset[];
  /** The services behind it (a household one, someone's own…), for their settings. */
  services: ServiceWithType[];
  yearMinor: number;
}

/**
 * A sub-service of Vehicles or Health (Registration): its bills under the
 * vehicle each is for. A vehicle with no bill of this type isn't listed.
 */
export function subServiceView(
  hh: Household,
  me: { id: string },
  type: ServiceType,
  today: string,
  db: Db = getDb(),
): SubServiceView | null {
  const kind = assetKindOf(type.category);
  if (!kind) return null;
  const category = type.category as GroupedCategory;
  const bills = listBills(hh.id, { viewer: me.id }, db).filter(
    (b) => b.service.typeSlug === type.slug,
  );
  const assets = listAssets(hh.id, { kind, viewer: me.id }, db);
  return {
    type,
    category,
    kind,
    groups: assets
      .map((a) => {
        const own = bills.filter((b) => b.assetId === a.id);
        return { asset: a, bills: own, yearMinor: yearOf(own, today) };
      })
      .filter((g) => g.bills.length > 0),
    waiting: bills.filter((b) => !b.assetId),
    assets,
    services: listServices(hh.id, { viewer: me.id, includeInactive: true }, db).filter(
      (s) => s.typeSlug === type.slug,
    ),
    yearMinor: yearOf(bills, today),
  };
}
