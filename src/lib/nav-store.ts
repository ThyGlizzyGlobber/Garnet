import { eq } from 'drizzle-orm';
import { getDb, type Db } from '@/db/client';
import { household, member } from '@/db/schema';
import { parseNavLayout, suggestGroupName, type NavLayout, type NavLine } from '@/lib/nav-layout';

/**
 * Where the side menu's arrangement is kept (src/lib/nav-layout.ts). The
 * household's part (its groups, its services in no group, the order inside
 * its main services) is the household's, on household.nav_layout, and only
 * admins change it (SCOPE-shell.md §8 Q1). Each person's own part (My
 * Services and the order inside their own main services, keys starting
 * "m") is theirs, on member.nav_layout. Reading joins the two.
 */

type Who = { id: string; householdId: string };

const EMPTY: NavLayout = { loose: [], groups: [], mine: [], mineGroups: [], children: {} };
const own = (key: string) => key.startsWith('m');
const pickChildren = (children: Record<string, string[]>, mine: boolean) =>
  Object.fromEntries(Object.entries(children).filter(([k]) => own(k) === mine));

function read(text: string | null | undefined): NavLayout | null {
  return text ? parseNavLayout(text) : null;
}

export function getNavLayout(me: Who, db: Db = getDb()): NavLayout | null {
  const hh = read(
    db
      .select({ navLayout: household.navLayout })
      .from(household)
      .where(eq(household.id, me.householdId))
      .get()?.navLayout,
  );
  const mine = read(
    db.select({ navLayout: member.navLayout }).from(member).where(eq(member.id, me.id)).get()
      ?.navLayout,
  );
  if (!hh && !mine) return null;
  return {
    loose: hh?.loose ?? [],
    groups: hh?.groups ?? [],
    mine: mine?.mine ?? [],
    mineGroups: mine?.mineGroups ?? [],
    children: {
      ...pickChildren(hh?.children ?? {}, false),
      ...pickChildren(mine?.children ?? {}, true),
    },
  };
}

function writeHousehold(householdId: string, layout: NavLayout, db: Db): void {
  db.update(household)
    .set({
      navLayout: JSON.stringify({ ...layout, mine: [], mineGroups: [] }),
      updatedAt: new Date().toISOString(),
    })
    .where(eq(household.id, householdId))
    .run();
}

function writeMember(memberId: string, layout: NavLayout, db: Db): void {
  db.update(member)
    .set({
      navLayout: JSON.stringify({ ...layout, loose: [], groups: [] }),
      updatedAt: new Date().toISOString(),
    })
    .where(eq(member.id, memberId))
    .run();
}

/**
 * Keep the arrangement: the household's groups and order when an admin
 * saves it (anyone else's change to them is ignored), and always this
 * person's own. A group left unnamed takes the name suggested for it. The
 * orders inside main services are kept as they were (saveNavChildren
 * changes those).
 */
export function saveNavLayout(
  me: Who,
  layout: Omit<NavLayout, 'children'>,
  lines: NavLine[],
  admin: boolean,
  db: Db = getDb(),
): void {
  const byKey = new Map(lines.map((l) => [l.key, l]));
  const named = (gs: NavLayout['groups']) =>
    gs.map((g) => ({
      ...g,
      name:
        g.name ||
        suggestGroupName(g.items.map((k) => byKey.get(k)).filter((l): l is NavLine => !!l)),
    }));
  const now = getNavLayout(me, db) ?? EMPTY;
  // The household's lines never go in a person's groups, nor theirs in the household's.
  const keep = (keys: string[], mine: boolean) => keys.filter((k) => own(k) === mine);
  const keepGroups = (gs: NavLayout['groups'], mine: boolean) =>
    named(gs).map((g) => ({ ...g, items: keep(g.items, mine) }));
  if (admin) {
    writeHousehold(
      me.householdId,
      {
        ...now,
        loose: keep(layout.loose, false),
        groups: keepGroups(layout.groups, false),
        children: pickChildren(now.children, false),
      },
      db,
    );
  }
  writeMember(
    me.id,
    {
      ...now,
      mine: keep(layout.mine, true),
      mineGroups: keepGroups(layout.mineGroups, true),
      children: pickChildren(now.children, true),
    },
    db,
  );
}

/**
 * Keep the order of the services (or vehicles) inside one main service
 * ("c:vehicle", "mt:donations"): a person's own main service is theirs to
 * order; the household's, an admin's.
 */
export function saveNavChildren(
  me: Who,
  key: string,
  ids: string[],
  admin: boolean,
  db: Db = getDb(),
): void {
  const mine = own(key);
  if (!mine && !admin) return;
  const now = getNavLayout(me, db) ?? EMPTY;
  const next = parseNavLayout({ ...now, children: { ...now.children, [key]: ids } });
  if (!next) return;
  if (mine) writeMember(me.id, { ...next, children: pickChildren(next.children, true) }, db);
  else
    writeHousehold(me.householdId, { ...next, children: pickChildren(next.children, false) }, db);
}
