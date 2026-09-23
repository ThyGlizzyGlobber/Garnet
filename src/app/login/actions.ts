'use server';

import { redirect } from 'next/navigation';
import type { ActionState } from '@/components/ui/form';
import { verifyPin } from '@/lib/auth/pin';
import { loginAs, logout as destroySession } from '@/lib/auth/session';
import { str } from '@/lib/actions';
import { getMember } from '@/lib/members';

export async function login(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const memberId = str(fd, 'memberId');
  const pin = str(fd, 'pin');
  const m = getMember(memberId);
  if (!m || !(await verifyPin(pin, m.pinHash))) {
    // Small constant delay blunts PIN guessing on the LAN.
    await new Promise((r) => setTimeout(r, 400));
    return { error: 'Wrong PIN. Try again.' };
  }
  await loginAs(m.id);
  redirect('/');
}

export async function logout(): Promise<void> {
  await destroySession();
  redirect('/login');
}
