import { eq } from 'drizzle-orm';
import { getDb, type Db } from '@/db/client';
import { member } from '@/db/schema';
import { parseNavLayout, suggestGroupName, type NavLayout, type NavLine } from '@/lib/nav-layout';

/** Where each person's side-menu arrangement is kept: member.nav_layout (src/lib/nav-layout.ts). */

export function getNavLayout(memberId: string, db: Db = getDb()): NavLayout | null {
  const row = db
    .select({ navLayout: member.navLayout })
    .from(member)
    .where(eq(member.id, memberId))
    .get();
  return row?.navLayout ? parseNavLayout(row.navLayout) : null;
}

function write(memberId: string, layout: NavLayout, db: Db): void {
  db.update(member)
    .set({ navLayout: JSON.stringify(layout), updatedAt: new Date().toISOString() })
    .where(eq(member.id, memberId))
    .run();
}

/**
 * Keep this person's groups and their order; a group left unnamed takes the
 * name suggested for it. The orders inside main services are kept as they
 * were (saveNavChildren changes those).
 */
export function saveNavLayout(
  memberId: string,
  layout: Omit<NavLayout, 'children'>,
  lines: NavLine[],
  db: Db = getDb(),
): void {
  const byKey = new Map(lines.map((l) => [l.key, l]));
  write(
    memberId,
    {
      loose: layout.loose,
      mine: layout.mine,
      mineGroups: layout.mineGroups.map((g) => ({
        ...g,
        name:
          g.name ||
          suggestGroupName(g.items.map((k) => byKey.get(k)).filter((l): l is NavLine => !!l)),
      })),
      groups: layout.groups.map((g) => ({
        ...g,
        name:
          g.name ||
          suggestGroupName(g.items.map((k) => byKey.get(k)).filter((l): l is NavLine => !!l)),
      })),
      children: getNavLayout(memberId, db)?.children ?? {},
    },
    db,
  );
}

/** Keep the order of the services (or vehicles) inside one main service ("c:vehicle", "mt:donations"). */
export function saveNavChildren(
  memberId: string,
  key: string,
  ids: string[],
  db: Db = getDb(),
): void {
  const now = getNavLayout(memberId, db) ?? {
    loose: [],
    groups: [],
    mine: [],
    mineGroups: [],
    children: {},
  };
  const next = parseNavLayout({ ...now, children: { ...now.children, [key]: ids } });
  if (next) write(memberId, next, db);
}
