import type { Household, Member } from '@/db/schema';
import { getDb, type Db } from '@/db/client';
import { listBills } from '@/lib/bills';
import { listActiveMembers } from '@/lib/members';
import { monthBounds } from '@/lib/periods';
import { documentCounts } from '@/lib/review';
import { billsAddress } from '@/lib/bills-address';
import { isAdmin } from '@/lib/roles';
import { listServices } from '@/lib/services';
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
}

export interface ShellView {
  household: { name: string; members: string[] };
  split: boolean;
  services: ShellService[];
  mine: ShellService[];
  inboxCount: number;
  /** The household's bills address, for the Add bill sheet. */
  address: string | null;
  me: { name: string; colour: string; admin: boolean };
}

export function shellView(hh: Household, me: Member, today: string, db: Db = getDb()): ShellView {
  const { start, end } = monthBounds(today.slice(0, 7));
  const month = totalsForRange(hh.id, start, end, db);
  const accrued = new Map(month.byService.map((t) => [t.service.id, t.minor]));
  const services = listServices(hh.id, {}, db).map((s) => ({
    id: s.id,
    name: s.name,
    colour: s.colour,
    minor: accrued.get(s.id) ?? 0,
  }));
  const mine = listServices(hh.id, { owner: me.id }, db).map((s) => ({
    id: s.id,
    name: s.name,
    colour: s.colour,
    minor: listBills(hh.id, { serviceId: s.id, limit: 1 }, db)[0]?.amountMinor ?? 0,
  }));
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
