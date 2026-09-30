import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import { AppShell } from '@/components/app/shell';
import { authState, pathFor } from '@/lib/auth/session';
import { todayIn } from '@/lib/dates';
import { formatMoney } from '@/lib/format';
import { getHousehold } from '@/lib/households';
import { shellView } from '@/lib/shell';

export const dynamic = 'force-dynamic';

export default async function AppLayout({ children }: { children: ReactNode }) {
  const state = await authState();
  if (state.kind !== 'ok') redirect(pathFor(state)!);
  const me = state.member;
  const hh = getHousehold(me.householdId);
  if (!hh) redirect('/login');
  const t = await getTranslations('nav');
  const ta = await getTranslations('app');
  const view = shellView(hh, me, todayIn(hh.timezone));
  return (
    <AppShell
      view={view}
      locale={hh.locale}
      money={(minor) => formatMoney(minor, hh.currency, hh.locale, { whole: true })}
      labels={{
        nav: {
          home: t('home'),
          services: t('services'),
          bills: t('bills'),
          money: t('money'),
          inbox: t('inbox'),
        },
        settings: t('settings'),
        addBill: t('addBill'),
        search: t('search'),
        justYou: t('justYou'),
        admin: t('admin'),
        member: t('member'),
        servicesHead: t('servicesHead'),
        thisMonth: t('thisMonth'),
        justYours: t('justYours'),
        noServices: t('noServices'),
        product: ta('name'),
        householdHome: t('householdHome', { household: hh.name }),
      }}
    >
      {children}
    </AppShell>
  );
}
