'use server';

import { revalidatePath } from 'next/cache';
import { requireMember } from '@/lib/auth/session';
import { parseNavLayout } from '@/lib/nav-layout';
import { saveNavLayout } from '@/lib/nav-store';
import { groupServices, listServices } from '@/lib/services';
import { navLines } from '@/lib/shell';

/** Keep how this person arranged the side menu's services (and so the Services page). */
export async function saveNavLayoutAction(layout: unknown): Promise<void> {
  const me = await requireMember();
  const parsed = parseNavLayout(layout);
  if (!parsed) return;
  const lines = navLines(groupServices(listServices(me.householdId, { viewer: me.id })));
  saveNavLayout(me.id, parsed, lines);
  revalidatePath('/', 'layout');
}
