'use server';

import { revalidatePath } from 'next/cache';
import { requireMember } from '@/lib/auth/session';
import { parseNavLayout } from '@/lib/nav-layout';
import { saveNavChildren, saveNavLayout } from '@/lib/nav-store';
import { groupServices, listServices } from '@/lib/services';
import { navLines } from '@/lib/shell';

/** Keep how this person arranged the side menu's services (and so the Services page). */
export async function saveNavLayoutAction(layout: unknown): Promise<void> {
  const me = await requireMember();
  const parsed = parseNavLayout(layout);
  if (!parsed) return;
  const lines = [
    ...navLines(groupServices(listServices(me.householdId, {}))),
    ...navLines(groupServices(listServices(me.householdId, { owner: me.id })), true),
  ];
  saveNavLayout(me.id, parsed, lines);
  revalidatePath('/', 'layout');
}

/** Keep the order inside one main service (and so on its page). */
export async function saveNavChildrenAction(key: unknown, ids: unknown): Promise<void> {
  const me = await requireMember();
  if (typeof key !== 'string' || !Array.isArray(ids)) return;
  saveNavChildren(
    me.id,
    key,
    ids.filter((id): id is string => typeof id === 'string'),
  );
  revalidatePath('/', 'layout');
}
