import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getIronSession, type SessionOptions } from 'iron-session';
import type { Account, Member } from '@/db/schema';
import { getAccount, isOperator, membershipsFor } from '@/lib/accounts';
import { getEnv } from '@/lib/env';
import { getHousehold } from '@/lib/households';
import { getMemberForSession } from '@/lib/members';
import { requestIsHttps, safeNext } from '@/lib/request';
import { findDevice, forgetDevice, touchDevice, trustDevice } from './devices';
import { isAdmin } from '@/lib/roles';

/**
 * Two cookies:
 *  - hud_device: a random token naming a trusted browser (set by a full sign-in
 *    with Google or an emailed code; lasts AUTH_DEVICE_DAYS).
 *  - hud_session: sealed session data. `unlockedAt` lasts AUTH_SESSION_DAYS;
 *    after that the member's PIN unlocks again on the same trusted device.
 * Demo households (fictional data) keep the old pick-a-name + PIN sign-in.
 */
export interface SessionData {
  accountId?: string;
  memberId?: string;
  unlockedAt?: number;
  demoMemberId?: string;
  /** Email waiting for its one-time code. */
  pendingEmail?: string;
  /** Invite link token to accept once signed in. */
  pendingInvite?: string;
  /** Where to go after signing in. */
  next?: string;
  /** A just-created invite's link and code, shown once to the admin who made it. */
  flashInvite?: {
    memberId: string;
    link: string;
    code: string;
    emailed?: string;
    emailError?: string;
  };
}

const DEVICE_COOKIE = 'hud_device';

/**
 * Cookies are Secure when the request came in over HTTPS (the Cloudflare
 * Tunnel) and not otherwise, so the wall iPad on plain http://<nas-ip> keeps
 * working. A browser only ever sends each cookie back to the host that set it.
 */
async function options(): Promise<SessionOptions> {
  const env = getEnv();
  return {
    cookieName: 'hud_session',
    password: env.AUTH_SECRET,
    ttl: env.AUTH_DEVICE_DAYS * 86_400,
    cookieOptions: { httpOnly: true, sameSite: 'lax', secure: await requestIsHttps() },
  };
}

export async function getSession() {
  return getIronSession<SessionData>(await cookies(), await options());
}

export type AuthState =
  | { kind: 'anonymous' }
  /** Trusted device, unlock expired: ask for the PIN. */
  | { kind: 'locked'; account: Account; member: Member }
  /** Signed in but not in a household yet: create or join one. */
  | { kind: 'no-household'; account: Account }
  /** Signed in and joined, but no PIN chosen yet. */
  | { kind: 'needs-pin'; account: Account; member: Member }
  | { kind: 'ok'; account: Account | null; member: Member; demo: boolean };

/** Read-only: works in server components (no cookie writes). */
export async function authState(now = Date.now()): Promise<AuthState> {
  const session = await getSession();
  if (session.demoMemberId) {
    const m = getMemberForSession(session.demoMemberId);
    if (m && getHousehold(m.householdId)?.isDemo)
      return { kind: 'ok', account: null, member: m, demo: true };
  }
  if (!session.accountId) return { kind: 'anonymous' };
  const account = getAccount(session.accountId);
  if (!account) return { kind: 'anonymous' };
  const jar = await cookies();
  const device = findDevice(jar.get(DEVICE_COOKIE)?.value, account.id, undefined, now);
  if (!device) return { kind: 'anonymous' };
  const memberships = membershipsFor(account.id);
  const member = memberships.find((m) => m.id === session.memberId) ?? memberships[0];
  const unlocked =
    !!session.unlockedAt && now - session.unlockedAt < getEnv().AUTH_SESSION_DAYS * 86_400_000;
  if (!member) return unlocked ? { kind: 'no-household', account } : { kind: 'anonymous' };
  if (!unlocked)
    return member.pinHash ? { kind: 'locked', account, member } : { kind: 'anonymous' };
  if (!member.pinHash) return { kind: 'needs-pin', account, member };
  return { kind: 'ok', account, member, demo: false };
}

/** Where a signed-out, locked or half-set-up visitor should be sent. */
export function pathFor(state: AuthState, next?: string): string | null {
  const q = next && next !== '/' ? `?next=${encodeURIComponent(next)}` : '';
  switch (state.kind) {
    case 'anonymous':
      return `/login${q}`;
    case 'locked':
      return `/unlock${q}`;
    case 'no-household':
      return '/welcome';
    case 'needs-pin':
      return '/set-pin';
    case 'ok':
      return null;
  }
}

/** The member for this request, or null (API routes). */
export async function currentMember(): Promise<Member | null> {
  const s = await authState();
  return s.kind === 'ok' ? s.member : null;
}

/** Pages and actions that need a fully signed-in member. */
export async function requireMember(next?: string): Promise<Member> {
  const s = await authState();
  if (s.kind !== 'ok') redirect(pathFor(s, next)!);
  return s.member;
}

/** Household admin (stored as role "owner"). */
export async function requireOwner(): Promise<Member> {
  const m = await requireMember();
  if (!isAdmin(m)) redirect('/');
  return m;
}

/** Operator of the install: software updates, mailbox polling. */
export async function requireOperator(): Promise<Member> {
  const s = await authState();
  if (s.kind !== 'ok') redirect(pathFor(s)!);
  if (!isOperator(s.account)) redirect('/');
  return s.member;
}

export async function viewerIsOperator(): Promise<boolean> {
  const s = await authState();
  return s.kind === 'ok' && isOperator(s.account);
}

/**
 * Account-level pages (welcome, create household, set PIN, accept invite) need
 * a fresh, unlocked sign-in but not necessarily a household.
 */
export async function requireAccount(): Promise<Account> {
  const s = await authState();
  if (s.kind === 'ok' && s.account) return s.account;
  if (s.kind === 'no-household' || s.kind === 'needs-pin') return s.account;
  redirect(pathFor(s)!);
}

// ─── Writes (server actions and route handlers only) ─────────────────────────

/** After Google or an emailed code: trust this browser and unlock. */
export async function startSession(accountId: string, userAgent: string | null): Promise<void> {
  const jar = await cookies();
  const env = getEnv();
  const { token } = trustDevice(accountId, userAgent);
  jar.set(DEVICE_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: await requestIsHttps(),
    path: '/',
    maxAge: env.AUTH_DEVICE_DAYS * 86_400,
  });
  const session = await getSession();
  session.accountId = accountId;
  session.unlockedAt = Date.now();
  delete session.demoMemberId;
  delete session.pendingEmail;
  await session.save();
}

/** The device row behind this request's cookie, for PIN checks. */
export async function currentDeviceId(accountId: string): Promise<string | null> {
  const jar = await cookies();
  const d = findDevice(jar.get(DEVICE_COOKIE)?.value, accountId);
  if (d) touchDevice(d.id);
  return d?.id ?? null;
}

export async function markUnlocked(memberId?: string): Promise<void> {
  const session = await getSession();
  session.unlockedAt = Date.now();
  if (memberId) session.memberId = memberId;
  await session.save();
}

export async function setActiveMember(memberId: string): Promise<void> {
  const session = await getSession();
  session.memberId = memberId;
  await session.save();
}

export async function startDemoSession(memberId: string): Promise<void> {
  const session = await getSession();
  session.destroy();
  const fresh = await getSession();
  fresh.demoMemberId = memberId;
  await fresh.save();
}

/** Sign out: forget this browser and clear the session. */
export async function signOut(): Promise<void> {
  const session = await getSession();
  const jar = await cookies();
  if (session.accountId) {
    const d = findDevice(jar.get(DEVICE_COOKIE)?.value, session.accountId);
    if (d) forgetDevice(d.id);
  }
  jar.delete(DEVICE_COOKIE);
  session.destroy();
}

/** Signed out by too many wrong PINs: the device row is already gone. */
export async function dropDeviceCookie(): Promise<void> {
  const jar = await cookies();
  jar.delete(DEVICE_COOKIE);
  const session = await getSession();
  session.destroy();
}

export async function consumeNext(): Promise<string> {
  const session = await getSession();
  const next = session.next;
  delete session.next;
  await session.save();
  return safeNext(next) ?? '/';
}
