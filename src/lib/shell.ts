import type { Household, Member } from '@/db/schema';
import { getDb, type Db } from '@/db/client';
import { listBills } from '@/lib/bills';
import { listActiveMembers } from '@/lib/members';
import { monthBounds } from '@/lib/periods';
import { documentCounts } from '@/lib/review';
import { billsAddress } from '@/lib/bills-address';
import { isAdmin } from '@/lib/roles';
import {
  byType,
  groupServices,
  listServices,
  serviceHome,
  type ServiceWithType,
} from '@/lib/services';
import type { GroupedCategory } from '@/lib/service-categories';
import { totalsForRange } from '@/lib/stats';

/**
 * What the app's frame shows around every page (BRAND.md §9): the household
 * and who lives there, the nav (Money only when bills are split), each
 * service with this month's cost, the viewer's own services with their
 * latest bill, the Inbox count, and the viewer for the Settings link.
 */
interface ShellService {
  id: string;
  name: string;
  colour: string;
  /** Minor units: this month's accrued cost, or a personal service's latest bill. */
  minor: number;
  href: string;
}

/**
 * A line in the nav's services: a service on its own, or a main service with
 * its sub-services under an arrow (Subscriptions → Netflix, Spotify; Vehicles
 * → Registration, Car insurance), whose figure is theirs added up. A
 * category's name (Vehicles) is the shell's to word.
 */
export type ShellEntry =
  | ({ kind: 'service' } & ShellService)
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

export interface ShellView {
  household: { name: string; members: string[] };
  split: boolean;
  services: ShellEntry[];
  mine: ShellEntry[];
  inboxCount: number;
  /** The household's bills address, for the Add bill sheet. */
  address: string | null;
  me: { name: string; colour: string; admin: boolean };
}

export function shellView(hh: Household, me: Member, today: string, db: Db = getDb()): ShellView {
  const { start, end } = monthBounds(today.slice(0, 7));
  const month = totalsForRange(hh.id, start, end, db);
  const accrued = new Map(month.byService.map((t) => [t.service.id, t.minor]));
  const services = entries(listServices(hh.id, {}, db), (s) => accrued.get(s.id) ?? 0);
  const mine = entries(
    listServices(hh.id, { owner: me.id }, db),
    (s) => listBills(hh.id, { serviceId: s.id, limit: 1 }, db)[0]?.amountMinor ?? 0,
  );
  return {
    household: { name: hh.name, members: listActiveMembers(hh.id, today, db).map((m) => m.name) },
    split: hh.splitMode === 'shared',
    services,
    mine,
    inboxCount: documentCounts(hh.id, { viewer: me.id }, db).needs_review,
    address: billsAddress(hh, db),
    me: { name: me.name, colour: me.colour, admin: isAdmin(me) },
  };
}

function entries(services: ServiceWithType[], minor: (s: ServiceWithType) => number): ShellEntry[] {
  // A sub-service opens its card on its main service's page.
  const line = (s: ServiceWithType): ShellService => ({
    id: s.id,
    name: s.name,
    colour: s.colour,
    minor: minor(s),
    href: serviceHome(s),
  });
  return groupServices(services).map((g): ShellEntry => {
    if (!g.category && !g.typeSlug) return { kind: 'service', ...line(g.services[0]!) };
    // Vehicles → one line per kind of bill (Registration), each showing
    // Vehicles with that kind; every other main service → its services.
    const children =
      g.category === 'vehicle'
        ? byType(g.services).map(({ type, services: of }): ShellService => ({
            id: type.slug,
            name: type.label,
            colour: type.colour,
            minor: of.reduce((sum, s) => sum + minor(s), 0),
            href: `/services/category/vehicle?kind=${type.slug}`,
          }))
        : g.services.map(line);
    return {
      kind: 'group',
      key: g.category ? `c-${g.category}` : `t-${g.typeSlug}`,
      href: g.category ? `/services/category/${g.category}` : `/services/group/${g.typeSlug}`,
      name: g.category ? '' : g.label,
      category: g.category,
      colour: g.colour,
      minor: children.reduce((sum, c) => sum + c.minor, 0),
      children,
    };
  });
}
