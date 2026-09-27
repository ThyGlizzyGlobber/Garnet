import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { sealData } from 'iron-session';
import { authorizationUrl, newAttempt } from '@/lib/auth/google';
import { getSession } from '@/lib/auth/session';
import { appUrl, getEnv, isGoogleConfigured } from '@/lib/env';

export const dynamic = 'force-dynamic';

const OAUTH_COOKIE = 'hud_oauth';

/** Begin Google sign-in: remember the attempt in a sealed 10-minute cookie, then go to Google. */
export async function GET(req: Request) {
  if (!isGoogleConfigured()) return NextResponse.redirect(`${appUrl()}/login?reason=google-off`);
  const next = new URL(req.url).searchParams.get('next');
  if (next && next.startsWith('/') && !next.startsWith('//')) {
    const session = await getSession();
    session.next = next;
    await session.save();
  }
  const attempt = newAttempt();
  const jar = await cookies();
  jar.set(OAUTH_COOKIE, await sealData(attempt, { password: getEnv().AUTH_SECRET, ttl: 600 }), {
    httpOnly: true,
    sameSite: 'lax',
    secure: false,
    path: '/api/auth/google',
    maxAge: 600,
  });
  return NextResponse.redirect(authorizationUrl(attempt));
}
