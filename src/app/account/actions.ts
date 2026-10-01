'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import type { ActionState } from '@/components/ui/form';
import { str } from '@/lib/actions';
import { householdsOf } from '@/lib/account';
import { authState, setActiveMember, startDemoSession } from '@/lib/auth/session';
import { todayIn } from '@/lib/dates';
import { getHousehold } from '@/lib/households';
import { leaveBlocker, leaveHousehold, makePrimary } from '@/lib/members';

/** The memberships this session may switch between (the account's; in the demo, the demo person's). */
async function mine() {
  const s = await authState();
  if (s.kind === 'ok') return { s, memberships: householdsOf(s.member) };
  if (s.kind === 'no-household') return { s, memberships: [] };
  return { s, memberships: [] };
}

/** Open another household (the switcher, a tile): that member becomes the session's. */
export async function switchHouseholdAction(fd: FormData): Promise<void> {
  const { s, memberships } = await mine();
  const target = memberships.find((m) => m.id === str(fd, 'memberId'));
  if (!target) redirect('/account');
  if (s.kind === 'ok' && s.demo) {
    // Demo people have no account: the demo session itself names the member.
    if (!getHousehold(target.householdId)?.isDemo) redirect('/');
    await startDemoSession(target.id);
  } else {
    await setActiveMember(target.id);
  }
  redirect('/');
}

/** Mark a household as this person's home of residence (D7). */
export async function makePrimaryAction(fd: FormData): Promise<void> {
  const { s, memberships } = await mine();
  const target = memberships.find((m) => m.id === str(fd, 'memberId'));
  if (!target || s.kind !== 'ok' || !target.accountId) redirect('/account');
  makePrimary(target.accountId, target.id);
  revalidatePath('/', 'layout');
  redirect('/account');
}

/** Leave a household (§3d): allowed once settled, never for the last admin. */
export async function leaveHouseholdAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const { s, memberships } = await mine();
  const target = memberships.find((m) => m.id === str(fd, 'memberId'));
  if (!target || s.kind !== 'ok' || s.demo) redirect('/account');
  const hh = getHousehold(target.householdId);
  if (!hh) redirect('/account');
  const t = await getTranslations('account.leave');
  const why = leaveBlocker(hh.id, target);
  if (why) return { error: t(`blocked.${why}`, { household: hh.name }) };
  leaveHousehold(hh.id, target, todayIn(hh.timezone));
  if (s.member.id === target.id) {
    const next = memberships.find((m) => m.id !== target.id);
    if (next) await setActiveMember(next.id);
  }
  revalidatePath('/', 'layout');
  redirect('/account?left=1');
}
