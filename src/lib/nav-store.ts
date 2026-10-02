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

/** Keep this person's arrangement; a group left unnamed takes the name suggested for it. */
export function saveNavLayout(
  memberId: string,
  layout: NavLayout,
  lines: NavLine[],
  db: Db = getDb(),
): void {
  const byKey = new Map(lines.map((l) => [l.key, l]));
  const named: NavLayout = {
    loose: layout.loose,
    mine: layout.mine,
    groups: layout.groups.map((g) => ({
      ...g,
      name:
        g.name ||
        suggestGroupName(g.items.map((k) => byKey.get(k)).filter((l): l is NavLine => !!l)),
    })),
  };
  db.update(member)
    .set({ navLayout: JSON.stringify(named), updatedAt: new Date().toISOString() })
    .where(eq(member.id, memberId))
    .run();
}
