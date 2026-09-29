'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import type { ActionState } from '@/components/ui/form';
import { str, zodToState } from '@/lib/actions';
import { getTranslations } from 'next-intl/server';
import { hashPin, PIN_PATTERN, verifyPin } from '@/lib/auth/pin';
import { forgetOtherDevices } from '@/lib/auth/devices';
import {
  authState,
  currentDeviceId,
  getSession,
  requireMember,
  requireOwner,
} from '@/lib/auth/session';
import { EMAIL_PATTERN } from '@/lib/auth/tokens';
import { isIsoDate } from '@/lib/dates';
import { getHousehold } from '@/lib/households';
import { inviteLink, sendInviteEmail } from '@/lib/invite-email';
import { setNotifyPref } from '@/lib/notifications';
import { createInvite, revokeInvites } from '@/lib/invites';
import { createMember, deleteMember, getMember, setMemberRole, updateMember } from '@/lib/members';

const isoDate = z.string().refine(isIsoDate, 'Use a valid date');

const schema = z
  .object({
    name: z.string().min(1, 'Required').max(40),
    splitWeight: z.coerce.number().positive('Must be above zero'),
    activeFrom: isoDate,
    activeTo: z.string().refine((s) => s === '' || isIsoDate(s), 'Use a valid date'),
    colour: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    email: z.string().refine((e) => e === '' || EMAIL_PATTERN.test(e), 'Enter a valid email'),
  })
  .refine((v) => v.activeTo === '' || v.activeTo >= v.activeFrom, {
    path: ['activeTo'],
    message: 'Move-out is before move-in',
  });

function readPaymentDetails(fd: FormData) {
  const out: { label: string; value: string }[] = [];
  for (let i = 0; i < 6; i++) {
    const label = str(fd, `pd_label_${i}`);
    const value = str(fd, `pd_value_${i}`);
    if (label && value) out.push({ label, value });
  }
  return out;
}

function read(fd: FormData) {
  return schema.safeParse({
    name: str(fd, 'name'),
    splitWeight: str(fd, 'splitWeight') || '1',
    activeFrom: str(fd, 'activeFrom'),
    activeTo: str(fd, 'activeTo'),
    colour: str(fd, 'colour') || '#0a84ff',
    email: str(fd, 'email').toLowerCase(),
  });
}

/**
 * Create an invitation for a member, email it when there's an address, and keep
 * the link and code in a one-time flash so the admin can copy them.
 */
async function issueInvite(
  me: { id: string; householdId: string },
  memberId: string,
  email: string | null,
): Promise<void> {
  const hh = getHousehold(me.householdId)!;
  const inviter = getMember(me.householdId, me.id)!;
  const issued = createInvite(me.householdId, memberId, { email, createdByMemberId: me.id });
  const sent = email ? await sendInviteEmail(issued, hh, inviter) : null;
  const session = await getSession();
  session.flashInvite = {
    memberId,
    link: inviteLink(issued.token),
    code: issued.code,
    ...(sent?.sent ? { emailed: email! } : {}),
    ...(sent && !sent.sent ? { emailError: sent.reason } : {}),
  };
  await session.save();
}

export async function createMemberAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const me = await requireOwner();
  const parsed = read(fd);
  if (!parsed.success) return zodToState(parsed.error);
  const v = parsed.data;
  let id: string;
  try {
    id = createMember(me.householdId, {
      name: v.name,
      email: v.email || null,
      splitWeight: v.splitWeight,
      activeFrom: v.activeFrom,
      activeTo: v.activeTo || null,
      colour: v.colour,
      paymentDetails: readPaymentDetails(fd),
    }).id;
  } catch (e) {
    return { error: (e as Error).message };
  }
  revalidatePath('/members');
  if (!v.email) redirect('/members');
  await issueInvite(me, id, v.email);
  redirect(`/members/${id}/invite`);
}

export async function updateMemberAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const me = await requireMember();
  const id = str(fd, 'id');
  const target = getMember(me.householdId, id);
  if (!target) return { error: 'Member not found' };
  // Members edit themselves; the owner edits anyone.
  if (me.role !== 'owner' && me.id !== id)
    return { error: 'Only admins can edit other members.' };
  const parsed = read(fd);
  if (!parsed.success) return zodToState(parsed.error);
  const v = parsed.data;
  try {
    updateMember(me.householdId, id, {
      name: v.name,
      splitWeight: v.splitWeight,
      activeFrom: v.activeFrom,
      activeTo: v.activeTo || null,
      colour: v.colour,
      paymentDetails: readPaymentDetails(fd),
      // The email is where invitations go; once joined, the account owns sign-in.
      ...(!target.accountId ? { email: v.email || null } : {}),
    });
  } catch (e) {
    return { error: (e as Error).message };
  }
  revalidatePath('/members');
  redirect('/members');
}

/** Admin: make another member an admin, or a member again (never the last admin). */
export async function setMemberRoleAction(fd: FormData): Promise<void> {
  const me = await requireOwner();
  const id = str(fd, 'id');
  const role = str(fd, 'role');
  if (role !== 'owner' && role !== 'member') redirect('/members');
  try {
    setMemberRole(me.householdId, id, role);
  } catch {
    // Only the last admin can't step down; the page doesn't offer it.
  }
  revalidatePath('/members');
  // Stepping down yourself: you can no longer edit others.
  redirect(id === me.id && role === 'member' ? '/members' : `/members/${id}/edit`);
}

export async function deleteMemberAction(fd: FormData): Promise<void> {
  const me = await requireOwner();
  try {
    deleteMember(me.householdId, str(fd, 'id'));
  } catch {
    // Members with shares can't be deleted; the page explains to set a move-out date instead.
  }
  revalidatePath('/members');
  redirect('/members');
}

/** Admin: (re)send an invitation. Earlier links and codes for this member stop working. */
export async function inviteMemberAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const me = await requireOwner();
  const id = str(fd, 'id');
  const target = getMember(me.householdId, id);
  if (!target) return { error: 'Member not found' };
  if (target.accountId) redirect(`/members/${id}/invite`);
  const email = str(fd, 'email').toLowerCase();
  if (email && !EMAIL_PATTERN.test(email)) return { fieldErrors: { email: 'Enter a valid email' } };
  try {
    await issueInvite(me, id, email || target.email || null);
  } catch (e) {
    return { error: (e as Error).message };
  }
  revalidatePath('/members');
  redirect(`/members/${id}/invite`);
}

/**
 * Admin: stop someone signing in to this household. Their member row, bills and
 * shares stay; their PIN is cleared so a later invite starts fresh.
 */
export async function removeAccessAction(fd: FormData): Promise<void> {
  const me = await requireOwner();
  const target = getMember(me.householdId, str(fd, 'id'));
  if (!target || target.id === me.id || target.role === 'owner') redirect('/members');
  revokeInvites(me.householdId, target.id);
  updateMember(me.householdId, target.id, { accountId: null, pinHash: null });
  revalidatePath('/members');
  redirect(`/members/${target.id}/edit`);
}

/** Change your own PIN. Nobody else can. */
export async function changePinAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const me = await requireMember();
  const t = await getTranslations('pin');
  if (!me.pinHash || !(await verifyPin(str(fd, 'current'), me.pinHash))) {
    await new Promise((r) => setTimeout(r, 400));
    return { fieldErrors: { current: t('wrongCurrent') } };
  }
  const pin = str(fd, 'pin');
  if (!PIN_PATTERN.test(pin)) return { fieldErrors: { pin: t('invalid') } };
  if (pin !== str(fd, 'pinConfirm')) return { fieldErrors: { pinConfirm: t('mismatch') } };
  updateMember(me.householdId, me.id, { pinHash: await hashPin(pin) });
  return { ok: true };
}

/** Sign this account out of every other browser. */
export async function signOutOtherDevicesAction(): Promise<void> {
  const s = await authState();
  if (s.kind !== 'ok' || !s.account) redirect('/');
  const keep = await currentDeviceId(s.account.id);
  if (keep) forgetOtherDevices(s.account.id, keep);
  revalidatePath(`/members/${s.member.id}/edit`);
}

/** Your own email preferences. */
export async function saveNotifyPrefsAction(
  _prev: ActionState,
  fd: FormData,
): Promise<ActionState> {
  const me = await requireMember();
  setNotifyPref(me.householdId, me.id, {
    bills: fd.get('bills') === 'on',
    reminders: fd.get('reminders') === 'on',
    problems: fd.get('problems') === 'on',
  });
  revalidatePath(`/members/${me.id}/edit`);
  return { ok: true };
}
