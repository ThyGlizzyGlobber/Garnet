import { cookies, headers } from 'next/headers';
import { NextResponse } from 'next/server';
import { unsealData } from 'iron-session';
import { afterSignIn } from '@/app/login/actions';
import { signInAccount } from '@/lib/accounts';
import { completeSignIn, type GoogleAttempt } from '@/lib/auth/google';
import { startSession } from '@/lib/auth/session';
import { appUrl, getEnv } from '@/lib/env';

export const dynamic = 'force-dynamic';

const OAUTH_COOKIE = 'hud_oauth';

/** Google redirects back here with ?code&state. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const jar = await cookies();
  const sealed = jar.get(OAUTH_COOKIE)?.value;
  jar.delete({ name: OAUTH_COOKIE, path: '/api/auth/google' });
  const fail = () => NextResponse.redirect(`${appUrl()}/login?reason=google`);
  if (!sealed || url.searchParams.get('error')) return fail();
  try {
    const attempt = await unsealData<GoogleAttempt>(sealed, {
      password: getEnv().AUTH_SECRET,
      ttl: 600,
    });
    const identity = await completeSignIn(
      { code: url.searchParams.get('code') ?? '', state: url.searchParams.get('state') ?? '' },
      attempt,
    );
    const account = signInAccount({
      email: identity.email,
      name: identity.name,
      googleSub: identity.sub,
    });
    await startSession(account.id, (await headers()).get('user-agent'));
  } catch (e) {
    console.warn('[auth] Google sign-in failed:', (e as Error).message);
    return fail();
  }
  return NextResponse.redirect(`${appUrl()}${await afterSignIn()}`);
}
