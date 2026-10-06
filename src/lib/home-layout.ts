import { and, eq } from 'drizzle-orm';
import { getDb, type Db } from '@/db/client';
import { homeLayout } from '@/db/schema';
import {
  DEVICES,
  defaultLayout,
  parseLayout,
  toFourByThree,
  toOnePage,
  type Device,
  type HouseholdFacts,
  type Layout,
  type LayoutKind,
} from '@/lib/home-grid';
import { ulid } from '@/lib/ids';

/**
 * Saved Home (and wall) layouts, per person and kind of screen (D7). A
 * missing or unreadable row means the default layout for that household.
 */

/** Every device's layout for a person: saved where they've changed it, the default otherwise. */
export function layoutsFor(
  householdId: string,
  memberId: string,
  kind: LayoutKind,
  facts: HouseholdFacts,
  db: Db = getDb(),
): Record<Device, Layout> {
  const rows = db
    .select()
    .from(homeLayout)
    .where(
      and(
        eq(homeLayout.householdId, householdId),
        eq(homeLayout.memberId, memberId),
        eq(homeLayout.kind, kind),
      ),
    )
    .all();
  const out = {} as Record<Device, Layout>;
  for (const d of DEVICES) {
    const row = rows.find((r) => r.device === d);
    out[d] =
      (row && parseLayout({ density: row.density, pages: row.pages })) ??
      defaultLayout(d, kind, facts);
  }
  return out;
}

/** Keep a person's layout for one kind of screen (replacing what was there). */
export function saveLayout(
  householdId: string,
  memberId: string,
  device: Device,
  kind: LayoutKind,
  layout: Layout,
  db: Db = getDb(),
): void {
  const now = new Date().toISOString();
  db.insert(homeLayout)
    .values({
      id: ulid(),
      householdId,
      memberId,
      device,
      kind,
      density: layout.density,
      pages: layout.pages,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [homeLayout.memberId, homeLayout.device, homeLayout.kind],
      set: { density: layout.density, pages: layout.pages, updatedAt: now },
    })
    .run();
}

/** Back to the default for one kind of screen. */
export function resetLayout(
  householdId: string,
  memberId: string,
  device: Device,
  kind: LayoutKind,
  db: Db = getDb(),
): void {
  db.delete(homeLayout)
    .where(
      and(
        eq(homeLayout.householdId, householdId),
        eq(homeLayout.memberId, memberId),
        eq(homeLayout.device, device),
        eq(homeLayout.kind, kind),
      ),
    )
    .run();
}

/**
 * Every saved desktop and iPad-landscape Home moved onto four by three
 * (SCOPE-shell.md §8 Q9: the owner chose to move everyone). Run once per install.
 */
export function moveLayoutsToFourByThree(db: Db = getDb()): number {
  let n = 0;
  for (const row of db.select().from(homeLayout).all()) {
    const now = parseLayout({ density: row.density, pages: row.pages });
    if (!now) continue;
    const next = toFourByThree(row.device as Device, row.kind as LayoutKind, now);
    if (next === now) continue;
    db.update(homeLayout)
      .set({ density: next.density, pages: next.pages, updatedAt: new Date().toISOString() })
      .where(eq(homeLayout.id, row.id))
      .run();
    n += 1;
  }
  return n;
}

/**
 * Every saved layout folded onto one page (SCOPE-edit-home.md E-D5: Home is
 * one page): the same widgets, sizes and order; those the grid has no room
 * for stay in the layout hidden. Run once per install.
 */
export function moveLayoutsToOnePage(db: Db = getDb()): number {
  let n = 0;
  for (const row of db.select().from(homeLayout).all()) {
    const raw = row.pages as unknown;
    if (!Array.isArray(raw) || raw.length < 2) continue;
    const now = parseLayout({ density: row.density, pages: row.pages });
    if (!now) continue;
    db.update(homeLayout)
      .set({ pages: toOnePage(now.pages), updatedAt: new Date().toISOString() })
      .where(eq(homeLayout.id, row.id))
      .run();
    n += 1;
  }
  return n;
}
