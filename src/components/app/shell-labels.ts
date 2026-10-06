import { getTranslations } from 'next-intl/server';
import type { ShellLabels } from './shell';

/** The shell's words, for the household frame and the Account Dashboard's. */
export async function shellLabels(): Promise<ShellLabels> {
  const t = await getTranslations('nav');
  const ta = await getTranslations('app');
  const ts = await getTranslations('switcher');
  const tr = await getTranslations('roles');
  const tam = await getTranslations('accountMenu');
  return {
    nav: {
      home: t('home'),
      services: t('services'),
      bills: t('bills'),
      money: t('money'),
      members: t('members'),
      inbox: t('inbox'),
    },
    search: t('search'),
    admin: t('admin'),
    member: t('member'),
    roles: {
      owner: tr('owner'),
      landlord: tr('landlord'),
      member: tr('member'),
      family: tr('family'),
      tenant: tr('tenant'),
      boarder: tr('boarder'),
    },
    card: {
      toPay: (amount) => t('card.toPay', { amount }),
      allPaid: t('card.allPaid'),
      nothingDue: t('card.nothingDue'),
      ring: (percent) => t('card.ring', { percent }),
    },
    product: ta('name'),
    households: t('households'),
    account: t('accountShort'),
    console: t('console'),
    yourHouseholds: t('yourHouseholds'),
    acct: {
      overview: t('acct.overview'),
      profile: t('acct.profile'),
      notifications: t('acct.notifications'),
      security: t('acct.security'),
      appearance: t('acct.appearance'),
    },
    switcher: {
      title: ts('title'),
      open: ts('open'),
      dashboard: ts('dashboard'),
      ring: (name, percent) => ts('ring', { name, percent }),
    },
    accountMenu: {
      open: tam('open'),
      notifications: tam('notifications'),
      appearance: tam('appearance'),
      profile: tam('profile'),
      wall: tam('wall'),
      backend: tam('backend'),
      signOut: tam('signOut'),
      dashboardShort: tam('dashboardShort'),
      settingsShort: tam('settingsShort'),
      editHome: tam('editHome'),
    },
  };
}
