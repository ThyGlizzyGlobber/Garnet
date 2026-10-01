import type { Account, Household, Member } from '@/db/schema';
import { getDb, type Db } from '@/db/client';
import { accountGivenName, membershipsFor, signInMethod } from '@/lib/accounts';
import { billDue } from '@/lib/bill-status';
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
}

export interface AccountView {
  name: string | null;
  email: string | null;
  method: 'google' | 'code' | 'demo';
  hasPin: boolean;
  tiles: HouseholdTile[];
  /** What the viewer owes across every household, when they all use one currency. */
  oweAll: { minor: number; currency: string; locale: string } | null;
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
  const overdue = listBills(hh.id, { viewer: m.id }, db).filter(
    (b) => billDue(b, today).status.key === 'overdue',
  ).length;
  return {
    memberId: m.id,
    householdId: hh.id,
    name: hh.name,
    isDemo: hh.isDemo,
    primary: m.isPrimary,
    current,
    admin: isAdmin(m),
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
  };
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
  return {
    name: account ? accountGivenName(account) : (me?.name ?? null),
    email: account?.email ?? null,
    method: account ? signInMethod(account) : 'demo',
    hasPin: !!account?.pinHash,
    tiles,
    oweAll:
      first && currencies.size === 1
        ? {
            minor: tiles.reduce((sum, t) => sum + t.oweMinor, 0),
            currency: first.currency,
            locale: first.locale,
          }
        : null,
  };
}
