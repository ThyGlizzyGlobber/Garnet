import type { Account, Household, Member } from '@/db/schema';
import type { HouseholdType } from '@/lib/household-types';
import { getDb, type Db } from '@/db/client';
import { accountGivenName, membershipsFor, signInMethod } from '@/lib/accounts';
import { billDue, type BillStatus } from '@/lib/bill-status';
import { listBills } from '@/lib/bills';
import { todayIn } from '@/lib/dates';
import { getHousehold } from '@/lib/households';
import { isActiveOn, listMembers } from '@/lib/members';
import { moneyView } from '@/lib/money';
import { monthBounds } from '@/lib/periods';
import { documentCounts } from '@/lib/review';
import { isAdmin } from '@/lib/roles';
import { totalsForRange } from '@/lib/stats';

/**
 * A person's households, for the Account Dashboard and the switcher
 * (SCOPE-accounts.md §3). One tile per membership: the household, who lives
 * there, the viewer's role, and what the household needs from them — what
 * they owe there (the tile's number, D12), this month's total, and whether
 * anything is waiting or overdue. Numbers are worked out here; pages lay out.
 */
export interface HouseholdTile {
  memberId: string;
  householdId: string;
  name: string;
  isDemo: boolean;
  /** The account's home of residence (D7). */
  primary: boolean;
  /** The household this request is in. */
  current: boolean;
  admin: boolean;
  /** The member's role and the household's type, for the role's name and the type's icon. */
  role: string;
  type: HouseholdType | null;
  people: { name: string; colour: string }[];
  currency: string;
  locale: string;
  /** The viewer's unpaid shares there. */
  oweMinor: number;
  /** Bills due this month, in full. */
  monthMinor: number;
  waiting: number;
  overdue: number;
  /** When the household splits bills (Money exists). */
  split: boolean;
  /**
   * The tile's ring: in a household that splits bills, the viewer's shares this
   * financial year that are paid back; otherwise this month's bills paid to
   * the provider. Counts, so the page words it ("7 of 9").
   */
  ring: { kind: 'shares' | 'bills'; done: number; total: number };
}

/** A bill on the dashboard's Recent bills table, from any of the person's households. */
interface RecentBill {
  id: string;
  memberId: string;
  household: string;
  service: string;
  provider: string | null;
  /** What's due next (an instalment's, or the bill's). */
  dueDate: string;
  amountMinor: number;
  currency: string;
  locale: string;
  status: BillStatus['key'];
  /** Days until it's due (negative when overdue). */
  days: number;
}

export interface AccountView {
  name: string | null;
  email: string | null;
  method: 'google' | 'code' | 'demo';
  hasPin: boolean;
  tiles: HouseholdTile[];
  /** What the viewer owes across every household, when they all use one currency. */
  oweAll: { minor: number; currency: string; locale: string } | null;
  /** This month's bills across every household, when they all use one currency. */
  monthAll: { minor: number; currency: string; locale: string } | null;
  overdueAll: number;
  waitingAll: number;
  /** The latest bills across every household: overdue and due soon first, then the most recent. */
  recent: RecentBill[];
}

/** The memberships behind a session: the account's, or just this member in the demo. */
export function householdsOf(me: Member, db: Db = getDb()): Member[] {
  return me.accountId ? membershipsFor(me.accountId, db) : [me];
}

function householdTile(
  m: Member,
  hh: Household,
  current: boolean,
  db: Db = getDb(),
): HouseholdTile {
  const today = todayIn(hh.timezone);
  const { start, end } = monthBounds(today.slice(0, 7));
  const split = hh.splitMode === 'shared';
  const money = split ? moneyView(hh.id, m.id, today, hh.fiscalYearStartMonth, db) : null;
  const bills = listBills(hh.id, { viewer: m.id }, db);
  const overdue = bills.filter((b) => billDue(b, today).status.key === 'overdue').length;
  const thisMonth = bills
    .map((b) => billDue(b, today).status)
    .filter((st) => st.dueDate >= start && st.dueDate <= end);
  return {
    memberId: m.id,
    householdId: hh.id,
    name: hh.name,
    isDemo: hh.isDemo,
    primary: m.isPrimary,
    current,
    admin: isAdmin(m),
    role: m.role,
    type: hh.type,
    people: listMembers(hh.id, db)
      .filter((p) => isActiveOn(p, today))
      .map((p) => ({ name: p.name, colour: p.colour })),
    currency: hh.currency,
    locale: hh.locale,
    oweMinor: money?.youOweMinor ?? 0,
    monthMinor: totalsForRange(hh.id, start, end, db).total,
    waiting: documentCounts(hh.id, { viewer: m.id }, db).needs_review,
    overdue,
    split,
    ring: money
      ? { kind: 'shares', done: money.yourShares.paid, total: money.yourShares.total }
      : {
          kind: 'bills',
          done: thisMonth.filter((st) => st.key === 'paid').length,
          total: thisMonth.length,
        },
  };
}

/** Status order for the Recent bills table: what needs doing first. */
const URGENCY: Record<BillStatus['key'], number> = {
  overdue: 0,
  today: 1,
  tomorrow: 2,
  soon: 3,
  due: 4,
  paid: 5,
};

/** The latest bills across a person's households (overdue and due soon first), at most `limit`. */
function recentBills(memberships: Member[], limit = 6, db: Db = getDb()): RecentBill[] {
  const rows: RecentBill[] = [];
  for (const m of memberships) {
    const hh = getHousehold(m.householdId, db);
    if (!hh) continue;
    const today = todayIn(hh.timezone);
    for (const b of listBills(hh.id, { viewer: m.id }, db)) {
      const due = billDue(b, today);
      rows.push({
        id: b.id,
        memberId: m.id,
        household: hh.name,
        service: b.service.name,
        provider: b.service.provider,
        dueDate: due.status.dueDate,
        amountMinor: due.amountMinor,
        currency: hh.currency,
        locale: hh.locale,
        status: due.status.key,
        days: due.status.days,
      });
    }
  }
  const open = rows
    .filter((r) => r.status !== 'paid')
    .sort((a, b) => URGENCY[a.status] - URGENCY[b.status] || a.dueDate.localeCompare(b.dueDate));
  const paid = rows
    .filter((r) => r.status === 'paid')
    .sort((a, b) => b.dueDate.localeCompare(a.dueDate));
  return [...open, ...paid].slice(0, limit);
}

/** Every household tile for this person, the primary first, then by when they joined. */
export function householdTiles(me: Member | null, account: Account | null, db: Db = getDb()) {
  const memberships = me ? householdsOf(me, db) : account ? membershipsFor(account.id, db) : [];
  return memberships
    .flatMap((m) => {
      const hh = getHousehold(m.householdId, db);
      return hh ? [householdTile(m, hh, m.id === me?.id, db)] : [];
    })
    .sort((a, b) => Number(b.primary) - Number(a.primary));
}

export function accountView(
  account: Account | null,
  me: Member | null,
  db: Db = getDb(),
): AccountView {
  const tiles = householdTiles(me, account, db);
  const currencies = new Set(tiles.map((t) => t.currency));
  const first = tiles[0];
  const oneCurrency = first && currencies.size === 1;
  const memberships = me ? householdsOf(me, db) : account ? membershipsFor(account.id, db) : [];
  return {
    name: account ? accountGivenName(account) : (me?.name ?? null),
    email: account?.email ?? null,
    method: account ? signInMethod(account) : 'demo',
    hasPin: !!account?.pinHash,
    tiles,
    oweAll: oneCurrency
      ? {
          minor: tiles.reduce((sum, t) => sum + t.oweMinor, 0),
          currency: first.currency,
          locale: first.locale,
        }
      : null,
    monthAll: oneCurrency
      ? {
          minor: tiles.reduce((sum, t) => sum + t.monthMinor, 0),
          currency: first.currency,
          locale: first.locale,
        }
      : null,
    overdueAll: tiles.reduce((sum, t) => sum + t.overdue, 0),
    waitingAll: tiles.reduce((sum, t) => sum + t.waiting, 0),
    recent: recentBills(memberships, 6, db),
  };
}
