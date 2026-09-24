import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import { AppShell } from '@/components/app/shell';
import { currentMember } from '@/lib/auth/session';
import { getHousehold } from '@/lib/households';
import { logout } from '@/app/login/actions';
import { documentCounts } from '@/lib/review';

export const dynamic = 'force-dynamic';

export default async function AppLayout({ children }: { children: ReactNode }) {
  const hh = getHousehold();
  if (!hh) redirect('/setup');
  const me = await currentMember();
  if (!me) redirect('/login');
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
      reviewCount={documentCounts().needs_review}
      addHref="/bills/new"
      addLabel={t('addBill')}
      searchLabel={t('search')}
    >
      {children}
    </AppShell>
  );
}
