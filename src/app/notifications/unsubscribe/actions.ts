'use server';

import { redirect } from 'next/navigation';
import { str } from '@/lib/actions';
import { getMemberForSession } from '@/lib/members';
import { setNotifyPref, verifyUnsubscribe, type NotifyCategory } from '@/lib/notifications';

export async function unsubscribeAction(fd: FormData): Promise<void> {
  const m = str(fd, 'm');
  const c = str(fd, 'c');
  if (!verifyUnsubscribe(m, c, str(fd, 't'))) redirect('/notifications/unsubscribe');
  const member = getMemberForSession(m);
  if (member) setNotifyPref(member.householdId, member.id, { [c as NotifyCategory]: false });
  redirect('/notifications/unsubscribe?done=1');
}
