'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import type { ActionState } from '@/components/ui/form';
import { errorText, fieldErrors, str } from '@/lib/actions';
import {
  canEditAsset,
  createAsset,
  deleteAsset,
  fileBillUnder,
  fileWaitingBills,
  getAsset,
  setAssetOwner,
  updateAsset,
} from '@/lib/assets';
import { requireMember } from '@/lib/auth/session';
import { refileDocuments } from '@/lib/filing';
import { hasHousemates } from '@/lib/members';
import { visibleTo } from '@/lib/scope';

/**
 * Vehicles (src/lib/assets.ts): adding, changing and removing them, each on
 * its own page, and filing a bill under one. Anyone may add one, the
 * household's or their own; changing or removing follows canEditAsset.
 */

const VEHICLES = '/services/category/vehicle';

function refresh() {
  revalidatePath('/services', 'layout');
  revalidatePath('/bills', 'layout');
  revalidatePath('/');
}

/** Back to Vehicles, the vehicle's card open, saying how many waiting bills were filed. */
function back(id: string | null, filed: number): never {
  const q = [id && `open=${id}`, filed && `filed=${filed}`].filter(Boolean).join('&');
  redirect(`${VEHICLES}${q ? `?${q}` : ''}${id ? `#v-${id}` : ''}`);
}

/** "mine" makes it this member's own, only when others live there; otherwise the household's. */
function ownerFrom(fd: FormData, householdId: string, memberId: string): string | null {
  return str(fd, 'whose') === 'mine' && hasHousemates(householdId) ? memberId : null;
}

export async function createAssetAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const me = await requireMember();
  const name = str(fd, 'name');
  if (!name) return fieldErrors({ name: 'required' });
  if (name.length > 60) return fieldErrors({ name: 'tooLong' });
  const a = createAsset(me.householdId, {
    kind: 'vehicle',
    name,
    identifier: str(fd, 'identifier').slice(0, 40),
    ownerMemberId: ownerFrom(fd, me.householdId, me.id),
    createdByMemberId: me.id,
  });
  const filed = fileWaitingBills(me.householdId, a, me);
  if (filed) refileDocuments(me.householdId);
  refresh();
  back(a.id, filed);
}

export async function updateAssetAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const me = await requireMember();
  const te = await errorText();
  const a = getAsset(me.householdId, str(fd, 'id'));
  if (!a || !visibleTo(a.ownerMemberId, me.id)) return { error: te('assetNotFound') };
  if (!canEditAsset(me, a)) return { error: te('assetNotAllowed') };
  const name = str(fd, 'name');
  if (!name) return fieldErrors({ name: 'required' });
  if (name.length > 60) return fieldErrors({ name: 'tooLong' });
  let filed = 0;
  try {
    const whose = fd.has('whose') ? ownerFrom(fd, me.householdId, me.id) : a.ownerMemberId;
    if ((whose ?? null) !== (a.ownerMemberId ?? null))
      setAssetOwner(me.householdId, a.id, whose, me);
    const saved = updateAsset(me.householdId, a.id, {
      name,
      identifier: str(fd, 'identifier').slice(0, 40),
    });
    if (saved.identifierKey && saved.identifierKey !== a.identifierKey)
      filed = fileWaitingBills(me.householdId, saved, me);
    refileDocuments(me.householdId);
  } catch (e) {
    return { error: (e as Error).message };
  }
  refresh();
  back(a.id, filed);
}

export async function deleteAssetAction(fd: FormData): Promise<void> {
  const me = await requireMember();
  const a = getAsset(me.householdId, str(fd, 'id'));
  if (!a || !visibleTo(a.ownerMemberId, me.id) || !canEditAsset(me, a)) return;
  deleteAsset(me.householdId, a.id);
  refresh();
  back(null, 0);
}

/** File a bill under a vehicle, from the "Not filed under a vehicle" card. */
export async function fileBillAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const me = await requireMember();
  const assetId = str(fd, 'assetId') || null;
  if (!assetId) return fieldErrors({ assetId: 'chooseAsset' });
  try {
    fileBillUnder(me.householdId, str(fd, 'billId'), { assetId }, { me });
    refileDocuments(me.householdId);
  } catch (e) {
    return { error: (e as Error).message };
  }
  refresh();
  const to = str(fd, 'back');
  if (to.startsWith('/') && !to.startsWith('//')) redirect(to);
  return { ok: true };
}
