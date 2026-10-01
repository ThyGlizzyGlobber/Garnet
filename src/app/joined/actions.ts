'use server';

import { redirect } from 'next/navigation';
import type { ActionState } from '@/components/ui/form';
import { errorText, str } from '@/lib/actions';
import { authState, consumeNext, markUnlocked } from '@/lib/auth/session';
import { updateMember } from '@/lib/members';

/** Save how they appear in the household just joined, then the PIN (first time) or in. */
export async function saveJoinedAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const s = await authState();
  if (s.kind !== 'needs-pin' && s.kind !== 'ok') redirect('/');
  const name = str(fd, 'name').trim();
  if (!name) return { fieldErrors: { name: (await errorText())('yourName') } };
  const colour = str(fd, 'colour');
  try {
    updateMember(s.member.householdId, s.member.id, {
      name,
      ...(/^#[0-9a-fA-F]{6}$/.test(colour) ? { colour } : {}),
    });
  } catch {
    return { fieldErrors: { name: (await errorText())('nameTaken') } };
  }
  if (s.kind === 'needs-pin') redirect('/set-pin');
  await markUnlocked(s.member.id);
  redirect(await consumeNext());
}
