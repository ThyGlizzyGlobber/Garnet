import { getTranslations } from 'next-intl/server';
import type { ShellLabels } from './shell';

/** The shell's words, for the household frame and the Account Dashboard's. */
export async function shellLabels(householdName: string): Promise<ShellLabels> {
  const t = await getTranslations('nav');
  const ta = await getTranslations('app');
  const tm = await getTranslations('main');
  const ts = await getTranslations('switcher');
  const tr = await getTranslations('roles');
  return {
    nav: {
      home: t('home'),
      services: t('services'),
      bills: t('bills'),
      money: t('money'),
      inbox: t('inbox'),
    },
    settings: t('settings'),
    search: t('search'),
    justYou: t('justYou'),
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
    servicesHead: t('servicesHead'),
    essentials: t('essentials'),
    everythingElse: t('everythingElse'),
    showSection: t('showSection'),
    hideSection: t('hideSection'),
    thisMonth: t('thisMonth'),
    justYours: t('justYours'),
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
    yourHouseholds: t('yourHouseholds'),
    switcher: {
      title: ts('title'),
      hint: ts('hint'),
      primary: ts('primary'),
      all: ts('all'),
      start: ts('start'),
      join: ts('join'),
      open: ts('open'),
    },
  };
}
