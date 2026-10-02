import type { Household, Member } from '@/db/schema';
import { householdTiles, type HouseholdTile } from '@/lib/account';
import type { HouseholdType } from '@/lib/household-types';
import { getDb, type Db } from '@/db/client';
import { listAssets } from '@/lib/assets';
import { listBills } from '@/lib/bills';
import { dueParts } from '@/lib/instalments';
import { listActiveMembers } from '@/lib/members';
import { monthBounds } from '@/lib/periods';
import { documentCounts } from '@/lib/review';
import { billsAddress } from '@/lib/bills-address';
import { isAdmin } from '@/lib/roles';
import {
  byType,
  groupServices,
  listServices,
  type ServiceGroup,
  type ServiceWithType,
} from '@/lib/services';
import { arrange, navKey, orderMine, type NavGroup, type NavLine } from '@/lib/nav-layout';
import { getNavLayout } from '@/lib/nav-store';
import { isEssential, type GroupedCategory } from '@/lib/service-categories';
import { totalsForRange } from '@/lib/stats';

/**
 * What the app's frame shows around every page (BRAND.md §9): the household
 * and who lives there, the nav (Money only when bills are split), the
 * services with what's due on each this month, arranged in the viewer's own
 * groups and order (src/lib/nav-layout.ts), the Inbox count, and the viewer.
 */
interface ShellService {
  id: string;
  name: string;
  colour: string;
  /** Minor units: what's due on it this month. */
  minor: number;
  href: string;
}

/**
 * A line in the nav's services: a service on its own, or a main service with
 * its sub-services under an arrow (Subscriptions → Netflix, Spotify; Vehicles
 * → its vehicles), whose figure is theirs added up. A category's name
 * (Vehicles) is the shell's to word.
 */
export type ShellEntry =
  | ({ kind: 'service'; key: string } & ShellService)
  | {
      kind: 'group';
      key: string;
      href: string;
      name: string;
      category: GroupedCategory | null;
      colour: string;
      minor: number;
      children: ShellService[];
    };

/** One of the viewer's groups in the nav, or (group null) the services in none. */
interface ShellSection {
  group: NavGroup | null;
  entries: ShellEntry[];
}

export interface ShellView {
  household: { name: string; members: string[]; type: HouseholdType | null };
  /** Every household this person belongs to, for the switcher (SCOPE-accounts.md §3b). */
  households: HouseholdTile[];
  /** The household's currency, for the nav's figures. */
  currency: string;
  split: boolean;
  /** The household's services as the viewer arranged them; groups with nothing in them included. */
  sections: ShellSection[];
  /** My Services: the viewer's own, in their order, last. */
  mine: ShellEntry[];
  /** What each line is, for naming a group (the menu's editor). */
  lines: NavLine[];
  inboxCount: number;
  /** The household's bills address, for the Add bill sheet. */
  address: string | null;
  me: {
    name: string;
    colour: string;
    admin: boolean;
    role: string;
    /** The account's email, for the account menu (none for demo sign-ins). */
    email?: string | null;
  };
  /** A developer of the install sees the Console (SCOPE-console.md). */
  developer: boolean;
}

export function shellView(hh: Household, me: Member, today: string, db: Db = getDb()): ShellView {
  const { start, end } = monthBounds(today.slice(0, 7));
  // What's due this month on the household's services and the viewer's own.
  const scope = { viewer: me.id };
  const month = totalsForRange(hh.id, start, end, db, scope);
  const due = new Map(month.byService.map((t) => [t.service.id, t.minor]));
  // Vehicles, each with what's due on it this month.
  const vehicleBills = listBills(hh.id, scope, db).filter((b) => b.assetId);
  const vehicles = (owner: string | null): ShellService[] =>
    listAssets(hh.id, owner ? { kind: 'vehicle', owner } : { kind: 'vehicle' }, db).map((a) => ({
      id: a.id,
      name: a.name,
      colour: '',
      minor: vehicleBills
        .filter((b) => b.assetId === a.id)
        .flatMap(dueParts)
        .filter((p) => p.dueDate.slice(0, 7) === today.slice(0, 7))
        .reduce((sum, p) => sum + p.amountMinor, 0),
      href: `/services/vehicles/${a.id}`,
    }));
  const minor = (s: ServiceWithType) => due.get(s.id) ?? 0;
  // The household's services, arranged in the viewer's groups; then My Services, their own.
  const groups = groupServices(listServices(hh.id, {}, db));
  const all = entries(groups, minor, vehicles(null), false);
  const own = entries(
    groupServices(listServices(hh.id, { owner: me.id }, db)),
    minor,
    vehicles(me.id),
    true,
  );
  const layout = getNavLayout(me.id, db);
  const essential = (e: ShellEntry) =>
    e.kind === 'service' && isEssential(groups.find((g) => navKey(g) === e.key)!.services[0]!.type);
  return {
    household: {
      name: hh.name,
      members: listActiveMembers(hh.id, today, db).map((m) => m.name),
      type: hh.type,
    },
    households: householdTiles(me, null, db),
    currency: hh.currency,
    split: hh.splitMode === 'shared',
    sections: arrange(all, (e) => e.key, layout, essential),
    mine: orderMine(own, (e) => e.key, layout),
    lines: navLines(groups),
    inboxCount: documentCounts(hh.id, { viewer: me.id }, db).needs_review,
    address: billsAddress(hh, db),
    me: { name: me.name, colour: me.colour, admin: isAdmin(me), role: me.role },
    developer: false,
  };
}

/** What each line of the nav is, for naming a group of them. */
export function navLines(groups: ServiceGroup<ServiceWithType>[]): NavLine[] {
  return groups.map((g) => ({
    key: navKey(g),
    typeSlug: g.category ? null : (g.typeSlug ?? g.services[0]!.type.slug),
    category: g.category,
  }));
}

function entries(
  groups: ServiceGroup<ServiceWithType>[],
  minor: (s: ServiceWithType) => number,
  /** Vehicles' lines: the vehicles themselves, when there are any. */
  vehicles: ShellService[],
  /** The viewer's own (My Services). */
  mine: boolean,
): ShellEntry[] {
  // A sub-service opens its own page.
  const line = (s: ServiceWithType): ShellService => ({
    id: s.id,
    name: s.name,
    colour: s.colour,
    minor: minor(s),
    href: `/services/${s.id}`,
  });
  return groups.map((g): ShellEntry => {
    const key = navKey(g, mine);
    if (!g.category && !g.typeSlug) return { kind: 'service', key, ...line(g.services[0]!) };
    // Vehicles → its vehicles, each opening its own page (until there are
    // none: one line per kind of bill); every other main service → its services.
    const children =
      g.category === 'vehicle' && vehicles.length
        ? vehicles.map((v) => ({ ...v, colour: g.colour }))
        : g.category === 'vehicle'
          ? byType(g.services).map(({ type, services: of }): ShellService => ({
              id: type.slug,
              name: type.label,
              colour: type.colour,
              minor: of.reduce((sum, s) => sum + minor(s), 0),
              href: '/services/category/vehicle',
            }))
          : g.services.map(line);
    return {
      kind: 'group',
      key,
      href: g.category ? `/services/category/${g.category}` : `/services/group/${g.typeSlug}`,
      name: g.category ? '' : g.label,
      category: g.category,
      colour: g.colour,
      // Its services' month added up, like every other line.
      minor: g.services.reduce((sum, s) => sum + minor(s), 0),
      children,
    };
  });
}
