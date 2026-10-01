import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import { switchHouseholdAction } from '@/app/account/actions';
import { AppShell } from '@/components/app/shell';
import { shellLabels } from '@/components/app/shell-labels';
import { PageTitle } from '@/components/ui/blocks';
import { householdTiles } from '@/lib/account';
import { accountGivenName, isDeveloper } from '@/lib/accounts';
import { authState, pathFor } from '@/lib/auth/session';
import { formatMoney } from '@/lib/format';
import { DEFAULT_COLOUR } from '@/lib/palette';
import type { ShellView } from '@/lib/shell';
import { ConsoleTabs } from './tabs';

export const dynamic = 'force-dynamic';

/** The console's frame (SCOPE-console.md §3): developers only, in the account variant of the shell, with its tabs. */
export default async function ConsoleLayout({ children }: { children: ReactNode }) {
  const state = await authState();
  if (state.kind !== 'ok' && state.kind !== 'no-household') redirect(pathFor(state)!);
  const account = state.account ?? null;
  if (!isDeveloper(account)) redirect('/account');
  const ta = await getTranslations('app');
  const t = await getTranslations('console');
  const me = state.kind === 'ok' ? state.member : null;
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
    me: { name, colour: me?.colour ?? DEFAULT_COLOUR, admin: false, role: 'member' },
    developer: true,
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
      <div className="scr console">
        <PageTitle title={t('title')} lede={t('lede')} />
        <ConsoleTabs
          tabs={[
            { href: '/console', label: t('tabs.overview') },
            { href: '/console/households', label: t('tabs.households') },
            { href: '/console/accounts', label: t('tabs.accounts') },
            { href: '/console/access', label: t('tabs.access') },
            { href: '/console/health', label: t('tabs.health') },
            { href: '/console/audit', label: t('tabs.audit') },
          ]}
        />
        {children}
      </div>
    </AppShell>
  );
}
