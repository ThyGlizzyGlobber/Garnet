'use server';

import { redirect } from 'next/navigation';
import { rememberAppearance } from '@/lib/auth/appearance';
import { authState } from '@/lib/auth/session';
import { DEFAULT_APPEARANCE, isPreset, isTheme } from '@/lib/appearance';
import { str } from '@/lib/actions';
import { updateMember } from '@/lib/members';

/** Joining by invite, step three (§6a): save the newcomer's colours, then on to their PIN. */
export async function saveColoursAction(fd: FormData): Promise<void> {
  const s = await authState();
  if (s.kind !== 'needs-pin') redirect('/');
  const preset = str(fd, 'preset');
  const theme = str(fd, 'theme');
  const next = {
    preset: isPreset(preset) ? preset : DEFAULT_APPEARANCE.preset,
    theme: isTheme(theme) ? theme : DEFAULT_APPEARANCE.theme,
    glass: DEFAULT_APPEARANCE.glass,
  };
  updateMember(s.member.householdId, s.member.id, {
    appearancePreset: next.preset,
    theme: next.theme,
  });
  await rememberAppearance(next);
  redirect('/set-pin');
}
