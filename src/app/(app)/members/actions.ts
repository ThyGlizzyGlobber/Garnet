'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import type { ActionState } from '@/components/ui/form';
import { str, zodToState } from '@/lib/actions';
import { hashPin, PIN_PATTERN } from '@/lib/auth/pin';
import { requireMember, requireOwner } from '@/lib/auth/session';
import { isIsoDate } from '@/lib/dates';
import { createMember, deleteMember, getMember, updateMember } from '@/lib/members';

const isoDate = z.string().refine(isIsoDate, 'Use a valid date');

const schema = z
  .object({
    name: z.string().min(1, 'Required').max(40),
    splitWeight: z.coerce.number().positive('Must be above zero'),
    activeFrom: isoDate,
    activeTo: z.string().refine((s) => s === '' || isIsoDate(s), 'Use a valid date'),
    colour: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    pin: z.string().refine((p) => p === '' || PIN_PATTERN.test(p), 'PIN must be 4–8 digits'),
    pinConfirm: z.string(),
  })
  .refine((v) => v.activeTo === '' || v.activeTo >= v.activeFrom, {
    path: ['activeTo'],
    message: 'Move-out is before move-in',
  })
  .refine((v) => v.pin === v.pinConfirm, { path: ['pinConfirm'], message: 'PINs do not match' });

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
    pin: str(fd, 'pin'),
    pinConfirm: str(fd, 'pinConfirm'),
  });
}

export async function createMemberAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const me = await requireMember();
  const parsed = read(fd);
  if (!parsed.success) return zodToState(parsed.error);
  const v = parsed.data;
  if (!v.pin)
    return {
      error: 'Please fix the highlighted fields.',
      fieldErrors: { pin: 'A PIN is required' },
    };
  try {
    createMember(me.householdId, {
      name: v.name,
      pinHash: await hashPin(v.pin),
      splitWeight: v.splitWeight,
      activeFrom: v.activeFrom,
      activeTo: v.activeTo || null,
      colour: v.colour,
      paymentDetails: readPaymentDetails(fd),
    });
  } catch (e) {
    return { error: (e as Error).message };
  }
  revalidatePath('/members');
  redirect('/members');
}

export async function updateMemberAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const me = await requireMember();
  const id = str(fd, 'id');
  const target = getMember(me.householdId, id);
  if (!target) return { error: 'Member not found' };
  // Members edit themselves; the owner edits anyone.
  if (me.role !== 'owner' && me.id !== id)
    return { error: 'Only the owner can edit other members.' };
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
      ...(v.pin ? { pinHash: await hashPin(v.pin) } : {}),
    });
  } catch (e) {
    return { error: (e as Error).message };
  }
  revalidatePath('/members');
  redirect('/members');
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
