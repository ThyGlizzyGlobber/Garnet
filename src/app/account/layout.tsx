import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import { AppShell } from '@/components/app/shell';
import { shellLabels } from '@/components/app/shell-labels';
import { householdTiles } from '@/lib/account';
import { accountGivenName, isDeveloper } from '@/lib/accounts';
import { authState, pathFor } from '@/lib/auth/session';
import { formatMoney } from '@/lib/format';
import { DEFAULT_COLOUR } from '@/lib/palette';
import type { ShellView } from '@/lib/shell';
import { switchHouseholdAction } from './actions';

export const dynamic = 'force-dynamic';

/**
 * The Account Dashboard's frame: the shell without a household (SCOPE-accounts.md
 * §3a). Signed in with or without a household; locked and PIN-less sessions go
 * where they belong first.
 */
export default async function AccountLayout({ children }: { children: ReactNode }) {
  const state = await authState();
  if (state.kind !== 'ok' && state.kind !== 'no-household') redirect(pathFor(state)!);
  const ta = await getTranslations('app');
  const me = state.kind === 'ok' ? state.member : null;
  const account = state.account ?? null;
  const name = me?.name ?? (account ? (accountGivenName(account) ?? account.email) : '');
  const view: ShellView = {
    household: { name: ta('name'), members: [], type: null },
    households: householdTiles(me, account),
    currency: 'AUD',
    split: false,
    services: [],
    mine: [],
    inboxCount: 0,
    address: null,
    me: {
      name,
      colour: me?.colour ?? DEFAULT_COLOUR,
      admin: false,
      role: 'member',
      email: account?.email ?? null,
    },
    developer: isDeveloper(account),
  };
  return (
    <AppShell
      view={view}
      variant="account"
      locale="en"
      money={(minor, currency, locale) => formatMoney(minor, currency, locale, { whole: true })}
      labels={await shellLabels(ta('name'))}
      switchAction={switchHouseholdAction}
    >
      {children}
    </AppShell>
  );
}
