import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import { AppShell } from '@/components/app/shell';
import { authState, pathFor } from '@/lib/auth/session';
import { getHousehold } from '@/lib/households';
import { logout } from '@/app/login/actions';
import { documentCounts } from '@/lib/review';

export const dynamic = 'force-dynamic';

export default async function AppLayout({ children }: { children: ReactNode }) {
  const state = await authState();
  if (state.kind !== 'ok') redirect(pathFor(state)!);
  const me = state.member;
  const hh = getHousehold(me.householdId);
  if (!hh) redirect('/login');
  const t = await getTranslations('nav');
  const nav = [
    { href: '/', label: t('home'), icon: 'home' },
    { href: '/bills', label: t('bills'), icon: 'receipt' },
    ...(hh.splitMode === 'shared' ? [{ href: '/ledger', label: t('ledger'), icon: 'ledger' }] : []),
    { href: '/services', label: t('services'), icon: 'bolt' },
    { href: '/members', label: t('members'), icon: 'people' },
  ];
  return (
    <AppShell
      householdName={hh.name}
      memberName={me.name}
      nav={nav}
      logoutAction={logout}
      logoutLabel={t('logout')}
      settingsHref="/settings"
      settingsLabel={t('settings')}
      wallHref="/wall"
      wallLabel={t('wall')}
      reviewHref="/review"
      reviewLabel={t('review')}
      reviewCount={documentCounts(hh.id).needs_review}
      addHref="/bills/new"
      addLabel={t('addBill')}
      searchLabel={t('search')}
    >
      {children}
    </AppShell>
  );
}
