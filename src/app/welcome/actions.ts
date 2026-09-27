'use server';

import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import type { ActionState } from '@/components/ui/form';
import { str } from '@/lib/actions';
import { isOperator, linkMember, membershipsFor, unclaimedOwners } from '@/lib/accounts';
import { verifyPin } from '@/lib/auth/pin';
import { getSession, markUnlocked, requireAccount, setActiveMember } from '@/lib/auth/session';
import { acceptInvite, findInviteByCode, findInviteByToken } from '@/lib/invites';
import { rateLimit } from '@/lib/rate-limit';

/** Join with the short code from an invitation. */
export async function joinWithCodeAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const account = await requireAccount();
  const t = await getTranslations('welcome.join');
  if (!rateLimit(`join:${account.id}`, 10, 3_600_000)) return { error: t('rateLimited') };
  const found = findInviteByCode(str(fd, 'code'));
  if (!found) return { fieldErrors: { code: t('invalid') } };
  let memberId: string;
  try {
    memberId = acceptInvite(found.invite.id, account.id, account.email).id;
  } catch (e) {
    return { error: (e as Error).message };
  }
  await setActiveMember(memberId);
  redirect('/set-pin');
}

/** Accept an invitation link while signed in. */
export async function acceptInviteAction(fd: FormData): Promise<void> {
  const account = await requireAccount();
  const token = str(fd, 'token');
  const found = findInviteByToken(token);
  if (!found) redirect(`/invite/${encodeURIComponent(token)}`);
  const m = acceptInvite(found.invite.id, account.id, account.email);
  await setActiveMember(m.id);
  redirect('/set-pin');
}

/** Not signed in yet: remember the invite, then sign in. */
export async function signInForInviteAction(fd: FormData): Promise<void> {
  const session = await getSession();
  session.pendingInvite = str(fd, 'token');
  await session.save();
  redirect('/login');
}

/**
 * Operator only, once: link a household owner from before accounts existed to
 * this account, proven with that member's old PIN (which stays their PIN).
 */
export async function claimOwnerAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const account = await requireAccount();
  const t = await getTranslations('welcome.claim');
  if (!isOperator(account) || membershipsFor(account.id).length) redirect('/');
  const target = unclaimedOwners().find((m) => m.id === str(fd, 'memberId'));
  if (!target?.pinHash || !rateLimit(`claim:${account.id}`, 5, 3_600_000))
    return { error: t('wrong') };
  if (!(await verifyPin(str(fd, 'pin'), target.pinHash))) {
    await new Promise((r) => setTimeout(r, 400));
    return { fieldErrors: { pin: t('wrong') } };
  }
  linkMember(target.id, account.id, account.email);
  await markUnlocked(target.id);
  redirect('/');
}
