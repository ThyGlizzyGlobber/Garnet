'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { ASSET_KINDS, type AssetKind } from '@/db/schema';
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
import { categoryOfKind } from '@/lib/service-categories';

/**
 * Vehicles and policies (src/lib/assets.ts): adding, changing and removing
 * them, and filing a bill under one. Anyone may add one, the household's or
 * their own; changing or removing follows canEditAsset.
 */

function refresh() {
  revalidatePath('/services', 'layout');
  revalidatePath('/bills', 'layout');
  revalidatePath('/');
}

/** Back to the Vehicles (or Health) page, saying how many waiting bills were filed. */
function back(kind: AssetKind, filed: number): never {
  const page = `/services/category/${categoryOfKind(kind)}`;
  redirect(filed ? `${page}?filed=${filed}` : page);
}

/** "mine" makes it this member's own, only when others live there; otherwise the household's. */
function ownerFrom(fd: FormData, householdId: string, memberId: string): string | null {
  return str(fd, 'whose') === 'mine' && hasHousemates(householdId) ? memberId : null;
}

export async function createAssetAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const me = await requireMember();
  const kind = str(fd, 'kind') as AssetKind;
  if (!ASSET_KINDS.includes(kind)) return { error: (await errorText())('assetNotFound') };
  const name = str(fd, 'name');
  if (!name) return fieldErrors({ name: 'required' });
  if (name.length > 60) return fieldErrors({ name: 'tooLong' });
  const identifier = str(fd, 'identifier').slice(0, 40);
  const a = createAsset(me.householdId, {
    kind,
    name,
    identifier,
    ownerMemberId: ownerFrom(fd, me.householdId, me.id),
    createdByMemberId: me.id,
  });
  const filed = fileWaitingBills(me.householdId, a, me);
  if (filed) refileDocuments(me.householdId);
  refresh();
  back(kind, filed);
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
  const identifier = str(fd, 'identifier').slice(0, 40);
  let filed = 0;
  try {
    const whose = fd.has('whose') ? ownerFrom(fd, me.householdId, me.id) : a.ownerMemberId;
    if ((whose ?? null) !== (a.ownerMemberId ?? null))
      setAssetOwner(me.householdId, a.id, whose, me);
    const saved = updateAsset(me.householdId, a.id, { name, identifier });
    if (saved.identifierKey && saved.identifierKey !== a.identifierKey)
      filed = fileWaitingBills(me.householdId, saved, me);
    refileDocuments(me.householdId);
  } catch (e) {
    return { error: (e as Error).message };
  }
  refresh();
  back(a.kind, filed);
}

export async function deleteAssetAction(fd: FormData): Promise<void> {
  const me = await requireMember();
  const a = getAsset(me.householdId, str(fd, 'id'));
  if (!a || !visibleTo(a.ownerMemberId, me.id) || !canEditAsset(me, a)) return;
  deleteAsset(me.householdId, a.id);
  refresh();
  back(a.kind, 0);
}

/**
 * File a bill under a vehicle or policy (or none), from a sub-service's
 * "No vehicle yet" list. Goes back to where it was sent from.
 */
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
