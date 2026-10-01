'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import type { ActionState } from '@/components/ui/form';
import { errorText, fieldErrors, str, zodToState } from '@/lib/actions';
import { DEFAULT_COLOUR } from '@/lib/palette';
import { getTranslations } from 'next-intl/server';
import { setAccountPin } from '@/lib/accounts';
import { hashPin, PIN_PATTERN, verifyPin } from '@/lib/auth/pin';
import { forgetOtherDevices, recordPinFailure, resetPinFailures } from '@/lib/auth/devices';
import {
  authState,
  currentDeviceId,
  dropDeviceCookie,
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
import { rateLimit } from '@/lib/rate-limit';
import { ADMIN_ROLE, isAdmin } from '@/lib/roles';
import { defaultRole, isRole, roleFor } from '@/lib/household-types';

/** Invitation emails a household may send per hour (the link and code still work beyond it). */
const INVITE_EMAILS_PER_HOUR = 10;

const isoDate = z.string().refine(isIsoDate, 'validDate');

const schema = z
  .object({
    name: z.string().min(1, 'required').max(40),
    splitWeight: z.coerce.number().positive('aboveZero'),
    activeFrom: isoDate,
    activeTo: z.string().refine((s) => s === '' || isIsoDate(s), 'validDate'),
    colour: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    email: z.string().refine((e) => e === '' || EMAIL_PATTERN.test(e), 'validEmail'),
  })
  .refine((v) => v.activeTo === '' || v.activeTo >= v.activeFrom, {
    path: ['activeTo'],
    message: 'moveOrder',
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
    colour: str(fd, 'colour') || DEFAULT_COLOUR,
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
  const t = await getTranslations('members.invite');
  // Sign-up is open, so invitations must not become a way to mail strangers:
  // demo households never email, and every household has an hourly cap.
  const sent = !email
    ? null
    : hh.isDemo
      ? { sent: false as const, reason: t('notInDemo') }
      : rateLimit(`invite:${hh.id}`, INVITE_EMAILS_PER_HOUR, 3_600_000)
        ? await sendInviteEmail(issued, hh, inviter)
        : { sent: false as const, reason: t('tooMany') };
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
    const hh = getHousehold(me.householdId)!;
    const asked = str(fd, 'role');
    id = createMember(me.householdId, {
      name: v.name,
      role: isRole(asked) && asked !== ADMIN_ROLE ? roleFor(hh.type, asked) : defaultRole(hh.type),
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
  const te = await errorText();
  if (!target) return { error: te('memberNotFound') };
  // Members edit themselves; admins edit anyone.
  if (!isAdmin(me) && me.id !== id) return { error: te('editOthers') };
  const parsed = read(fd);
  if (!parsed.success) return zodToState(parsed.error);
  const v = parsed.data;
  const admin = isAdmin(me);
  const hh = getHousehold(me.householdId)!;
  const asked = str(fd, 'role');
  try {
    // Housemate roles change here; admin comes and goes through the role card.
    if (admin && !isAdmin(target) && isRole(asked) && asked !== ADMIN_ROLE)
      setMemberRole(me.householdId, id, roleFor(hh.type, asked));
    updateMember(me.householdId, id, {
      name: v.name,
      colour: v.colour,
      paymentDetails: readPaymentDetails(fd),
      // Move-in, move-out and weight decide everyone's shares: admins only.
      ...(admin
        ? { splitWeight: v.splitWeight, activeFrom: v.activeFrom, activeTo: v.activeTo || null }
        : {}),
      // The email is where invitations go; once joined, the account owns sign-in.
      ...(admin && !target.accountId ? { email: v.email || null } : {}),
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
  const hh = getHousehold(me.householdId)!;
  const asked = str(fd, 'role');
  const role = isRole(asked) ? roleFor(hh.type, asked) : defaultRole(hh.type);
  try {
    setMemberRole(me.householdId, id, role);
  } catch {
    // Only the last admin can't step down; the page doesn't offer it.
  }
  revalidatePath('/members');
  // Stepping down yourself: you can no longer edit others.
  redirect(id === me.id && role !== ADMIN_ROLE ? '/members' : `/members/${id}/edit`);
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
  if (!target) return { error: (await errorText())('memberNotFound') };
  if (target.accountId) redirect(`/members/${id}/invite`);
  const email = str(fd, 'email').toLowerCase();
  if (email && !EMAIL_PATTERN.test(email)) return fieldErrors({ email: 'validEmail' });
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
 * shares stay; a later invite links them afresh.
 */
export async function removeAccessAction(fd: FormData): Promise<void> {
  const me = await requireOwner();
  const target = getMember(me.householdId, str(fd, 'id'));
  if (!target || target.id === me.id || isAdmin(target)) redirect('/members');
  revokeInvites(me.householdId, target.id);
  updateMember(me.householdId, target.id, { accountId: null, isPrimary: false });
  revalidatePath('/members');
  redirect(`/members/${target.id}/edit`);
}

/**
 * Change your own PIN. Nobody else can. Wrong current PINs count against this
 * browser like wrong unlocks do, so an unlocked device can't be used to guess it.
 */
export async function changePinAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const t = await getTranslations('pin');
  const s = await authState();
  if (s.kind !== 'ok' || !s.account) redirect('/');
  const deviceId = await currentDeviceId(s.account.id);
  if (!s.account.pinHash || !(await verifyPin(str(fd, 'current'), s.account.pinHash))) {
    await new Promise((r) => setTimeout(r, 400));
    if (deviceId && recordPinFailure(deviceId).forgotten) {
      await dropDeviceCookie();
      redirect('/login?reason=locked-out');
    }
    return { fieldErrors: { current: t('wrongCurrent') } };
  }
  if (deviceId) resetPinFailures(deviceId);
  const pin = str(fd, 'pin');
  if (!PIN_PATTERN.test(pin)) return { fieldErrors: { pin: t('invalid') } };
  if (pin !== str(fd, 'pinConfirm')) return { fieldErrors: { pinConfirm: t('mismatch') } };
  setAccountPin(s.account.id, await hashPin(pin));
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
