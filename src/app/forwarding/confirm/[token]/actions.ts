'use server';

import { redirect } from 'next/navigation';
import { str } from '@/lib/actions';
import { confirmForward } from '@/lib/forwarding';

export async function confirmForwardAction(fd: FormData): Promise<void> {
  const token = str(fd, 'token');
  const row = confirmForward(token);
  if (!row) redirect(`/forwarding/confirm/${encodeURIComponent(token)}`);
  redirect('/forwarding/confirm/done');
}
