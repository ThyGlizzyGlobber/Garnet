'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import type { ActionState } from '@/components/ui/form';
import { str } from '@/lib/actions';
import { householdsOf } from '@/lib/account';
import { authState, setActiveMember, startDemoSession } from '@/lib/auth/session';
import { todayIn } from '@/lib/dates';
import { getHousehold } from '@/lib/households';
import { leaveBlocker, leaveHousehold, makePrimary } from '@/lib/members';
import { setNotifyPref, type NotifyCategory } from '@/lib/notifications';
import { membershipsFor } from '@/lib/accounts';
import { MAX_NAME, MAX_PHOTO_BYTES, removePhoto, renameEverywhere, savePhoto } from '@/lib/profile';

/** The memberships this session may switch between (the account's; in the demo, the demo person's). */
async function mine() {
  const s = await authState();
  if (s.kind === 'ok') return { s, memberships: householdsOf(s.member) };
  if (s.kind === 'no-household') return { s, memberships: [] };
  return { s, memberships: [] };
}

/** Open another household (the switcher, a tile): that member becomes the session's. */
export async function switchHouseholdAction(fd: FormData): Promise<void> {
  const { s, memberships } = await mine();
  const target = memberships.find((m) => m.id === str(fd, 'memberId'));
  if (!target) redirect('/account');
  if (s.kind === 'ok' && s.demo) {
    // Demo people have no account: the demo session itself names the member.
    if (!getHousehold(target.householdId)?.isDemo) redirect('/');
    await startDemoSession(target.id);
  } else {
    await setActiveMember(target.id);
  }
  redirect('/');
}

/** Mark a household as this person's home of residence (D7). */
export async function makePrimaryAction(fd: FormData): Promise<void> {
  const { s, memberships } = await mine();
  const target = memberships.find((m) => m.id === str(fd, 'memberId'));
  if (!target || s.kind !== 'ok' || !target.accountId) redirect('/account');
  makePrimary(target.accountId, target.id);
  revalidatePath('/', 'layout');
  redirect('/account');
}

/**
 * Leave a household (§3d): allowed once settled, never for the last admin.
 * From the row's More options menu (SCOPE-redesign-2.md §4); when it can't be
 * left yet the page says why.
 */
export async function leaveHouseholdAction(fd: FormData): Promise<void> {
  const { s, memberships } = await mine();
  const target = memberships.find((m) => m.id === str(fd, 'memberId'));
  if (!target || s.kind !== 'ok' || s.demo) redirect('/account');
  const hh = getHousehold(target.householdId);
  if (!hh) redirect('/account');
  const why = leaveBlocker(hh.id, target);
  if (why) redirect(`/account?blocked=${why}&hh=${encodeURIComponent(hh.name)}`);
  leaveHousehold(hh.id, target, todayIn(hh.timezone));
  if (s.member.id === target.id) {
    const next = memberships.find((m) => m.id !== target.id);
    if (next) await setActiveMember(next.id);
  }
  revalidatePath('/', 'layout');
  redirect('/account?left=1');
}

/** One notification switch, saved as it's flipped (SCOPE-redesign-2.md §4 Notifications). */
export async function toggleNotifyAction(
  memberId: string,
  kind: NotifyCategory,
  on: boolean,
): Promise<void> {
  const s = await authState();
  const acct = s.kind === 'ok' || s.kind === 'no-household' ? s.account : null;
  if (!acct) redirect('/account');
  const me = membershipsFor(acct.id).find((m) => m.id === memberId);
  if (!me) redirect('/account');
  if (!['bills', 'reminders', 'problems'].includes(kind)) return;
  setNotifyPref(me.householdId, me.id, { [kind]: on });
  revalidatePath('/account/notifications');
}

/** The signed-in account (demo people have none, so they can't change a profile). */
async function myAccount() {
  const s = await authState();
  if (s.kind === 'ok' && s.account) return s.account;
  if (s.kind === 'no-household') return s.account;
  redirect('/account');
}

/** Your name, in every household you belong to (one that already has someone by it keeps the old one). */
export async function saveNameAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const a = await myAccount();
  const t = await getTranslations('profile.name');
  const name = str(fd, 'name').trim().replace(/\s+/g, ' ');
  if (!name) return { fieldErrors: { name: t('required') } };
  if (name.length > MAX_NAME) return { fieldErrors: { name: t('tooLong', { max: MAX_NAME }) } };
  const { kept } = renameEverywhere(a.id, name);
  revalidatePath('/', 'layout');
  return {
    ok: true,
    note: kept.length
      ? t('kept', { households: new Intl.ListFormat('en', { type: 'conjunction' }).format(kept) })
      : t('saved'),
  };
}

/** A new profile photo. */
export async function savePhotoAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const a = await myAccount();
  const t = await getTranslations('profile.photo');
  const file = fd.get('photo');
  if (!(file instanceof File) || file.size === 0) return { error: t('none') };
  if (file.size > MAX_PHOTO_BYTES) return { error: t('tooBig') };
  const result = await savePhoto(a.id, Buffer.from(await file.arrayBuffer()));
  if (!result.ok) return { error: t(result.reason === 'too-big' ? 'tooBig' : 'unreadable') };
  revalidatePath('/', 'layout');
  return { ok: true };
}

/** Take the profile photo away (the initial shows again). */
export async function removePhotoAction(): Promise<void> {
  const a = await myAccount();
  removePhoto(a.id);
  revalidatePath('/', 'layout');
}
