'use server';

import { revalidatePath } from 'next/cache';
import { requireMember } from '@/lib/auth/session';
import { recordPayment } from '@/lib/bills';
import { isIsoDate, todayIn } from '@/lib/dates';
import { getHousehold } from '@/lib/households';
import { getMember } from '@/lib/members';
import { remindDebtors } from '@/lib/notifications';
import { str } from '@/lib/actions';

/** "Remind everyone": email each housemate who owes me, at most once a day each. */
export async function remindEveryoneAction(): Promise<{
  sent: string[];
  already: string[];
  unreachable: string[];
}> {
  const me = await requireMember();
  const hh = getHousehold(me.householdId)!;
  if (hh.splitMode !== 'shared') return { sent: [], already: [], unreachable: [] };
  return remindDebtors(hh.id, me.id);
}

/** "Record a payment": one housemate paid me back for one or more shares. */
export async function recordPaymentAction(fd: FormData): Promise<{
  ok: boolean;
  totalMinor: number;
  from: string;
}> {
  const me = await requireMember();
  const hh = getHousehold(me.householdId)!;
  const from = getMember(hh.id, str(fd, 'from'));
  const method = str(fd, 'method');
  const day = str(fd, 'day');
  const shareIds = fd.getAll('share').map(String).filter(Boolean);
  if (!from || (method !== 'transfer' && method !== 'cash' && method !== 'other'))
    return { ok: false, totalMinor: 0, from: '' };
  const today = todayIn(hh.timezone);
  const r = recordPayment(hh.id, {
    shareIds,
    fromMemberId: from.id,
    toMemberId: me.id,
    method,
    day: isIsoDate(day) && day <= today ? day : undefined,
    markedByMemberId: me.id,
  });
  revalidatePath('/money');
  revalidatePath('/bills');
  revalidatePath('/');
  return { ok: r.shareIds.length > 0, totalMinor: r.totalMinor, from: from.name };
}
