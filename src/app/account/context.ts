import { redirect } from 'next/navigation';
import { accountView } from '@/lib/account';
import { authState, pathFor } from '@/lib/auth/session';
import { DEFAULT_COLOUR } from '@/lib/palette';
import { avatarUrl } from '@/lib/profile';

/**
 * Who is looking at an account page: their account (none for a demo person),
 * the household they're in (if any), their households as tiles, and how to
 * show them (name, colour, photo).
 */
export async function accountContext() {
  const state = await authState();
  if (state.kind !== 'ok' && state.kind !== 'no-household') redirect(pathFor(state)!);
  const account = state.account ?? null;
  const me = state.kind === 'ok' ? state.member : null;
  const view = accountView(account, me);
  return {
    account,
    me,
    demo: state.kind === 'ok' && state.demo,
    view,
    name: view.name ?? me?.name ?? account?.email ?? '',
    colour: me?.colour ?? DEFAULT_COLOUR,
    photo: avatarUrl(account),
    /** Dates in the person's household's format, or Australian English before they have one. */
    locale: view.tiles[0]?.locale ?? 'en-AU',
  };
}
