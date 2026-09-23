import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getIronSession, type SessionOptions } from 'iron-session';
import { getEnv } from '@/lib/env';
import { getMember } from '@/lib/members';
import type { Member } from '@/db/schema';

export interface SessionData {
  memberId?: string;
}

function options(): SessionOptions {
  const env = getEnv();
  return {
    cookieName: 'hud_session',
    password: env.AUTH_SECRET,
    ttl: env.AUTH_SESSION_DAYS * 86_400,
    cookieOptions: {
      httpOnly: true,
      sameSite: 'lax',
      // LAN-only over plain http: never require Secure or nobody can log in.
      secure: false,
    },
  };
}

export async function getSession() {
  return getIronSession<SessionData>(await cookies(), options());
}

/** The logged-in member, or null. */
export async function currentMember(): Promise<Member | null> {
  const session = await getSession();
  if (!session.memberId) return null;
  const m = getMember(session.memberId);
  if (!m) {
    session.destroy();
    return null;
  }
  return m;
}

/** Redirects to /login when nobody is logged in. */
export async function requireMember(): Promise<Member> {
  const m = await currentMember();
  if (!m) redirect('/login');
  return m;
}

export async function requireOwner(): Promise<Member> {
  const m = await requireMember();
  if (m.role !== 'owner') redirect('/');
  return m;
}

export async function loginAs(memberId: string) {
  const session = await getSession();
  session.memberId = memberId;
  await session.save();
}

export async function logout() {
  const session = await getSession();
  session.destroy();
}
