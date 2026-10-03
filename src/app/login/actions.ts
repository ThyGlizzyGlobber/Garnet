'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import type { ActionState } from '@/components/ui/form';
import { str } from '@/lib/actions';
import { setAccountPin, signInAccount } from '@/lib/accounts';
import { maySignUp, requestAccess } from '@/lib/access';
import { rememberAppearance } from '@/lib/auth/appearance';
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
import { getMemberForSession } from '@/lib/members';
import { ipAllowed } from '@/lib/rate-limit';
import { clientIp, safeNext } from '@/lib/request';

async function userAgent(): Promise<string | null> {
  return (await headers()).get('user-agent');
}

/** Remember where to land after signing in (only same-site paths). */
export async function rememberNext(next: string): Promise<void> {
  const safe = safeNext(next);
  if (!safe) return;
  const session = await getSession();
  session.next = safe;
  await session.save();
}

/** Step 1 of email sign-in: send a 6-digit code. */
export async function sendCodeAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const t = await getTranslations('login.errors');
  const email = normaliseEmail(str(fd, 'email'));
  if (!EMAIL_PATTERN.test(email)) return { fieldErrors: { email: t('email') } };
  if (!ipAllowed('sendCode', await clientIp())) return { error: t('tooMany') };
  // Early access (SCOPE-console.md §4): no code goes to an address that can't sign up.
  if (!maySignUp(email)) redirect(`/login/request?email=${encodeURIComponent(email)}`);
  await rememberNext(str(fd, 'next'));
  const issued = issueLoginCode(email);
  if (!issued.ok) return { error: t('rateLimited') };
  if (!(await sendCodeEmail(email, issued.code))) return { error: t('emailFailed') };
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
  if (!ipAllowed('verifyCode', await clientIp()))
    return { error: (await getTranslations('login.errors'))('tooMany') };
  const result = verifyLoginCode(email, str(fd, 'code'));
  if (!result.ok) return { fieldErrors: { code: t(result.reason) } };
  const account = signInAccount({ email });
  await startSession(account.id, await userAgent());
  redirect(await afterSignIn());
}

/** Send a fresh code to the pending address, and say on the code page whether it went. */
export async function resendCodeAction(): Promise<void> {
  const session = await getSession();
  const email = session.pendingEmail;
  if (!email) redirect('/login');
  if (!ipAllowed('sendCode', await clientIp())) redirect('/login/code?resent=wait');
  const issued = issueLoginCode(email);
  if (!issued.ok) redirect('/login/code?resent=wait');
  const sent = await sendCodeEmail(email, issued.code);
  redirect(sent ? '/login/code?resent=sent' : '/login/code?resent=failed');
}

async function sendCodeEmail(email: string, code: string): Promise<boolean> {
  const te = await getTranslations('email.code');
  const app = (await getTranslations('app'))('name');
  const sent = await sendEmail(
    composeEmail({
      to: email,
      subject: te('subject', { code }),
      blocks: [{ p: te('intro', { app }) }, { code }],
      footer: te('expiry'),
    }),
  );
  return sent.sent;
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
  if (!ipAllowed('demoLogin', await clientIp()))
    return { error: (await getTranslations('login.errors'))('tooMany') };
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
  if (!ipAllowed('unlock', await clientIp()))
    return { error: (await getTranslations('login.errors'))('tooMany') };
  if (!s.account.pinHash || !(await verifyPin(str(fd, 'pin'), s.account.pinHash))) {
    await new Promise((r) => setTimeout(r, 400));
    const failure = recordPinFailure(deviceId);
    if (failure.forgotten) {
      await dropDeviceCookie();
      redirect('/login?reason=locked-out');
    }
    return { error: t('wrong', { left: failure.remaining }) };
  }
  resetPinFailures(deviceId);
  await markUnlocked(s.member?.id);
  redirect(await consumeNext());
}

/** The account's first PIN, after joining or creating its first household (one PIN for every household, D2). */
export async function setPinAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const s = await authState();
  if (s.kind !== 'needs-pin') redirect('/');
  const t = await getTranslations('pin');
  const pin = str(fd, 'pin');
  if (!PIN_PATTERN.test(pin)) return { fieldErrors: { pin: t('invalid') } };
  if (pin !== str(fd, 'pinConfirm')) return { fieldErrors: { pinConfirm: t('mismatch') } };
  setAccountPin(s.account.id, await hashPin(pin));
  await markUnlocked(s.member.id);
  redirect(await consumeNext());
}

export async function logout(): Promise<void> {
  // The sign-in page keeps this person's light or dark on this device.
  const s = await authState();
  if (s.kind === 'ok' && s.account) await rememberAppearance({ theme: s.account.theme });
  await signOut();
  redirect('/login');
}

/** A stranger asking to be let in while early access is on (one open request per address). */
export async function requestAccessAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const t = await getTranslations('login');
  const email = normaliseEmail(str(fd, 'email'));
  const name = str(fd, 'name').trim();
  if (!EMAIL_PATTERN.test(email)) return { fieldErrors: { email: t('errors.email') } };
  if (!name) return { fieldErrors: { name: t('request.name') } };
  if (!ipAllowed('requestAccess', await clientIp())) return { error: t('errors.tooMany') };
  if (maySignUp(email)) redirect(`/login?email=${encodeURIComponent(email)}`);
  requestAccess({ name, email, message: str(fd, 'message').slice(0, 500) || null });
  redirect(`/login/request?email=${encodeURIComponent(email)}&sent=${encodeURIComponent(name)}`);
}
