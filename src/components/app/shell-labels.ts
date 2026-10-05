import { getTranslations } from 'next-intl/server';
import type { ShellLabels } from './shell';

/** The shell's words, for the household frame and the Account Dashboard's. */
export async function shellLabels(householdName: string): Promise<ShellLabels> {
  const t = await getTranslations('nav');
  const ta = await getTranslations('app');
  const tm = await getTranslations('main');
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
    settings: t('settings'),
    search: t('search'),
    people: (count) => t('people', { count }),
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
    servicesHead: t('servicesHead'),
    thisMonth: t('thisMonth'),
    otherServices: t('otherServices'),
    myServices: t('myServices'),
    noServices: t('noServices'),
    showSubs: t('showSubs'),
    hideSubs: t('hideSubs'),
    main: {
      vehicle: tm('main.vehicle'),
      health: tm('main.health'),
      lifestyle: tm('main.lifestyle'),
      home: tm('main.home'),
    },
    product: ta('name'),
    householdHome: t('householdHome', { household: householdName }),
    households: t('households'),
    account: t('accountShort'),
    console: t('console'),
    yourHouseholds: t('yourHouseholds'),
    householdCount: (count) => t('householdCount', { count }),
    acct: {
      overview: t('acct.overview'),
      myAccount: t('acct.myAccount'),
      profile: t('acct.profile'),
      notifications: t('acct.notifications'),
      security: t('acct.security'),
      appearance: t('acct.appearance'),
      developer: t('acct.developer'),
      primary: t('acct.primary'),
    },
    switcher: {
      title: ts('title'),
      open: ts('open'),
      dashboard: ts('dashboard'),
    },
    accountMenu: {
      open: tam('open'),
      dashboard: tam('dashboard'),
      settings: tam('settings'),
      notifications: tam('notifications'),
      appearance: tam('appearance'),
      profile: tam('profile'),
      wall: tam('wall'),
      backend: tam('backend'),
      signOut: tam('signOut'),
    },
  };
}
