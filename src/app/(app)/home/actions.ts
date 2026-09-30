'use server';

import { revalidatePath } from 'next/cache';
import { requireMember } from '@/lib/auth/session';
import { and, eq } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { share } from '@/db/schema';
import { setSharePaid } from '@/lib/bills';
import { DEVICES, LAYOUT_KINDS, parseLayout, type Device, type LayoutKind } from '@/lib/home-grid';
import { resetLayout, saveLayout } from '@/lib/home-layout';

const isDevice = (v: unknown): v is Device => (DEVICES as readonly unknown[]).includes(v);
const isKind = (v: unknown): v is LayoutKind => (LAYOUT_KINDS as readonly unknown[]).includes(v);

/** Keep this person's Home (or wall) layout for one kind of screen. */
export async function saveHomeLayoutAction(
  device: string,
  kind: string,
  layout: unknown,
): Promise<void> {
  const me = await requireMember();
  const parsed = parseLayout(layout);
  if (!isDevice(device) || !isKind(kind) || !parsed) return;
  saveLayout(me.householdId, me.id, device, kind, parsed);
}

/** Back to the default layout for one kind of screen. */
export async function resetHomeLayoutAction(device: string, kind: string): Promise<void> {
  const me = await requireMember();
  if (!isDevice(device) || !isKind(kind)) return;
  resetLayout(me.householdId, me.id, device, kind);
}

/** The viewer marks their own share of a bill paid (the Next due widget). */
export async function markMyShareAction(shareId: string, billId: string): Promise<void> {
  const me = await requireMember();
  // Only the viewer's own share, never a housemate's.
  const mine = getDb()
    .select({ id: share.id })
    .from(share)
    .where(
      and(eq(share.householdId, me.householdId), eq(share.id, shareId), eq(share.memberId, me.id)),
    )
    .get();
  if (!mine) return;
  setSharePaid(me.householdId, shareId, true, { markedByMemberId: me.id, method: 'transfer' });
  revalidatePath('/');
  revalidatePath(`/bills/${billId}`);
  revalidatePath('/money');
}
