'use server';

import { revalidatePath } from 'next/cache';
import { requireMember } from '@/lib/auth/session';
import { parseNavLayout } from '@/lib/nav-layout';
import { isAdmin } from '@/lib/roles';
import { saveNavChildren, saveNavLayout } from '@/lib/nav-store';
import { groupServices, listServices } from '@/lib/services';
import { navLines } from '@/lib/shell';

/**
 * Keep the side menu's arrangement (and so the Services page's): the
 * household's groups only from an admin, this person's own always.
 */
export async function saveNavLayoutAction(layout: unknown): Promise<void> {
  const me = await requireMember();
  const parsed = parseNavLayout(layout);
  if (!parsed) return;
  const lines = [
    ...navLines(groupServices(listServices(me.householdId, {}))),
    ...navLines(groupServices(listServices(me.householdId, { owner: me.id })), true),
  ];
  saveNavLayout(me, parsed, lines, isAdmin(me));
  revalidatePath('/', 'layout');
}

/** Keep the order inside one main service (and so on its page): the household's an admin's to change. */
export async function saveNavChildrenAction(key: unknown, ids: unknown): Promise<void> {
  const me = await requireMember();
  if (typeof key !== 'string' || !Array.isArray(ids)) return;
  saveNavChildren(
    me,
    key,
    ids.filter((id): id is string => typeof id === 'string'),
    isAdmin(me),
  );
  revalidatePath('/', 'layout');
}
