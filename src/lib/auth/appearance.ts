import { cache } from 'react';
import { cookies } from 'next/headers';
import { formatAppearance, parseAppearance, type Appearance } from '@/lib/appearance';
import { requestIsHttps } from '@/lib/request';
import { authState } from './session';

const APPEARANCE_COOKIE = 'hud_appearance';

/**
 * The colours for this request, read by the root layout so the first paint is
 * already right: the person's own choice once we know who they are (signed
 * in, or locked and asking for their PIN); before that, the last choice made
 * in this browser; otherwise the default.
 */
export const getAppearance = cache(async (): Promise<Appearance> => {
  const s = await authState();
  if (s.kind === 'ok' || s.kind === 'locked' || s.kind === 'needs-pin')
    return { preset: s.member.appearancePreset, theme: s.member.theme };
  return parseAppearance((await cookies()).get(APPEARANCE_COOKIE)?.value);
});

/** Remember a choice in this browser for the pages before sign-in. Server actions and route handlers only. */
export async function rememberAppearance(a: Appearance): Promise<void> {
  (await cookies()).set(APPEARANCE_COOKIE, formatAppearance(a), {
    path: '/',
    maxAge: 60 * 60 * 24 * 400,
    sameSite: 'lax',
    httpOnly: true,
    secure: await requestIsHttps(),
  });
}
