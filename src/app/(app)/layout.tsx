import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { AppShell } from '@/components/app/shell';
import { shellLabels } from '@/components/app/shell-labels';
import { authState, pathFor } from '@/lib/auth/session';
import { todayIn } from '@/lib/dates';
import { formatMoney } from '@/lib/format';
import { getHousehold } from '@/lib/households';
import { avatarUrl } from '@/lib/profile';
import { shellView } from '@/lib/shell';
import { switchHouseholdAction } from '@/app/account/actions';

export const dynamic = 'force-dynamic';

export default async function AppLayout({ children }: { children: ReactNode }) {
  const state = await authState();
  if (state.kind !== 'ok') redirect(pathFor(state)!);
  const me = state.member;
  const hh = getHousehold(me.householdId);
  if (!hh) redirect('/login');
  const shell = shellView(hh, me, todayIn(hh.timezone));
  const view = {
    ...shell,
    me: { ...shell.me, email: state.account?.email ?? null, photo: avatarUrl(state.account) },
  };
  return (
    <AppShell
      view={view}
      locale={hh.locale}
      money={(minor, currency, locale) => formatMoney(minor, currency, locale, { whole: true })}
      labels={await shellLabels(hh.name)}
      switchAction={switchHouseholdAction}
    >
      {children}
    </AppShell>
  );
}
