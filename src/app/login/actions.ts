'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import type { ActionState } from '@/components/ui/form';
import { str } from '@/lib/actions';
import { signInAccount } from '@/lib/accounts';
import { issueLoginCode, verifyLoginCode } from '@/lib/auth/codes';
import { recordPinFailure, resetPinFailures } from '@/lib/auth/devices';
import { hashPin, PIN_PATTERN, verifyPin } from '@/lib/auth/pin';
import {
  authState,
  consumeNext,
  currentDeviceId,
  dropDeviceCookie,
  getSession,
  markUnlocked,
  signOut,
  startDemoSession,
  startSession,
} from '@/lib/auth/session';
import { EMAIL_PATTERN, normaliseEmail } from '@/lib/auth/tokens';
import { composeEmail, sendEmail } from '@/lib/email';
import { getHousehold } from '@/lib/households';
import { getMemberForSession, updateMember } from '@/lib/members';

async function userAgent(): Promise<string | null> {
  return (await headers()).get('user-agent');
}

/** Remember where to land after signing in (only same-site paths). */
export async function rememberNext(next: string): Promise<void> {
  if (!next.startsWith('/') || next.startsWith('//')) return;
  const session = await getSession();
  session.next = next;
  await session.save();
}

/** Step 1 of email sign-in: send a 6-digit code. */
export async function sendCodeAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const t = await getTranslations('login.errors');
  const email = normaliseEmail(str(fd, 'email'));
  if (!EMAIL_PATTERN.test(email)) return { fieldErrors: { email: t('email') } };
  await rememberNext(str(fd, 'next'));
  const issued = issueLoginCode(email);
  if (!issued.ok) return { error: t('rateLimited') };
  const te = await getTranslations('email.code');
  const app = (await getTranslations('app'))('name');
  const sent = await sendEmail(
    composeEmail({
      to: email,
      subject: te('subject', { code: issued.code }),
      blocks: [{ p: te('intro', { app }) }, { code: issued.code }],
      footer: te('expiry'),
    }),
  );
  if (!sent.sent) return { error: t('emailFailed', { reason: sent.reason }) };
  const session = await getSession();
  session.pendingEmail = email;
  await session.save();
  redirect('/login/code');
}

/** Step 2 of email sign-in: check the code, then trust this browser. */
export async function verifyCodeAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const t = await getTranslations('code.errors');
  const session = await getSession();
  const email = session.pendingEmail;
  if (!email) return { error: t('noEmail') };
  const result = verifyLoginCode(email, str(fd, 'code'));
  if (!result.ok) return { fieldErrors: { code: t(result.reason) } };
  const account = signInAccount({ email });
  await startSession(account.id, await userAgent());
  redirect(await afterSignIn());
}

/** Send a fresh code to the pending address. */
export async function resendCodeAction(): Promise<void> {
  const session = await getSession();
  const email = session.pendingEmail;
  if (!email) redirect('/login');
  const fd = new FormData();
  fd.set('email', email);
  await sendCodeAction({}, fd);
}

/** Where to go once signed in: a pending invite first, then the remembered page. */
export async function afterSignIn(): Promise<string> {
  const session = await getSession();
  const invite = session.pendingInvite;
  if (invite) {
    delete session.pendingInvite;
    await session.save();
    return `/invite/${encodeURIComponent(invite)}`;
  }
  return consumeNext();
}

/** Demo households keep pick-a-name + PIN (fictional data only). */
export async function demoLoginAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const t = await getTranslations('login.demo');
  const m = getMemberForSession(str(fd, 'memberId'));
  const demo = m ? getHousehold(m.householdId)?.isDemo : false;
  if (!m || !demo || !m.pinHash || !(await verifyPin(str(fd, 'pin'), m.pinHash))) {
    await new Promise((r) => setTimeout(r, 400));
    return { error: t('wrong') };
  }
  await startDemoSession(m.id);
  redirect('/');
}

/** Unlock a trusted device with the member's own PIN. */
export async function unlockAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const s = await authState();
  if (s.kind !== 'locked') redirect('/');
  const t = await getTranslations('pin');
  const deviceId = await currentDeviceId(s.account.id);
  if (!deviceId) redirect('/login');
  if (!s.member.pinHash || !(await verifyPin(str(fd, 'pin'), s.member.pinHash))) {
    await new Promise((r) => setTimeout(r, 400));
    const failure = recordPinFailure(deviceId);
    if (failure.forgotten) {
      await dropDeviceCookie();
      redirect('/login?reason=locked-out');
    }
    return { error: t('wrong', { left: failure.remaining }) };
  }
  resetPinFailures(deviceId);
  await markUnlocked(s.member.id);
  redirect(await consumeNext());
}

/** First PIN after joining or creating a household. */
export async function setPinAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const s = await authState();
  if (s.kind !== 'needs-pin') redirect('/');
  const t = await getTranslations('pin');
  const pin = str(fd, 'pin');
  if (!PIN_PATTERN.test(pin)) return { fieldErrors: { pin: t('invalid') } };
  if (pin !== str(fd, 'pinConfirm')) return { fieldErrors: { pinConfirm: t('mismatch') } };
  updateMember(s.member.householdId, s.member.id, { pinHash: await hashPin(pin) });
  await markUnlocked(s.member.id);
  redirect(await consumeNext());
}

export async function logout(): Promise<void> {
  await signOut();
  redirect('/login');
}
