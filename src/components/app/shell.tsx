import Link from 'next/link';
import type { ReactNode } from 'react';
import { Avatar } from '@/components/ui/colour';
import { IconButton } from '@/components/ui/controls';
import { formatMoney, formatMoneyParts, formatMonth } from '@/lib/format';
import type { ShellView } from '@/lib/shell';
import { logout } from '@/app/login/actions';
import { AccountMenu, type AccountMenuItem } from './account-menu';
import { AddBillButton } from './add-bill';
import { GarnetMark } from './garnet-mark';
import { Icon } from './icons';
import { OfflineBar } from './offline-bar';
import { StackRing } from './stack-ring';
import { NavItems, SectionName, type NavItem } from './nav-items';
import { HouseholdSwitcher, type SwitcherLabels, type SwitcherRow } from './household-switcher';
import { roleKey, typeIcon } from '@/lib/household-types';

/**
 * The app's frame (BRAND.md §9, SCOPE-header.md): the scene behind, and on
 * a desktop or an iPad on its side one glass bar across the top: the brand
 * and the household on the left, the links as pills in the middle, search,
 * Add bill and you on the right. The household's name drops its switcher,
 * your avatar the account menu, and (H2) Services drops a panel of every
 * service. The page has the whole width under the bar, inside a site-wide
 * cap. A phone, or an upright iPad, keeps the household as a card across the
 * top and the links in a bar along the bottom. Layout in
 * src/styles/shell.css; the numbers come from shellView().
 */
export interface ShellLabels {
  nav: {
    home: string;
    services: string;
    bills: string;
    money: string;
    members: string;
    inbox: string;
  };
  search: string;
  admin: string;
  member: string;
  /** Role names by roleKey (Admin, Owner/Landlord, Tenant…). */
  roles: Record<string, string>;
  /** The household card's words (a phone's top card). */
  card: {
    toPay: (amount: string) => string;
    allPaid: string;
    nothingDue: string;
    /** The ring, for screen readers: "12% of this month's bills paid". */
    ring: (percent: string) => string;
  };
  /** The product's name, under the household's on a phone's Home. */
  product: string;
  /** The Account Dashboard's nav (the account variant). */
  households: string;
  account: string;
  console: string;
  /** "Your households": the switcher's name in the account area. */
  yourHouseholds: string;
  /** The account area's pills: Overview, then My Account's pages. */
  acct: {
    overview: string;
    profile: string;
    notifications: string;
    security: string;
    appearance: string;
  };
  switcher: SwitcherLabels & {
    /** A household's ring, for screen readers: "Maple Street: 64% of this month's bills paid". */
    ring: (name: string, percent: string) => string;
  };
  accountMenu: {
    open: string;
    notifications: string;
    appearance: string;
    profile: string;
    wall: string;
    backend: string;
    signOut: string;
    /** The tiles' shorter names. */
    dashboardShort: string;
    settingsShort: string;
    editHome: string;
  };
}

export function AppShell({
  view,
  labels,
  locale,
  variant = 'household',
  switchAction,
  children,
}: {
  view: ShellView;
  labels: ShellLabels;
  locale: string;
  /** The household frame, or the Account Dashboard's (no household, no services). */
  variant?: 'household' | 'account';
  /** Opens the household whose member id is posted (the switcher). */
  switchAction: (fd: FormData) => Promise<void>;
  children: ReactNode;
}) {
  const account = variant === 'account';
  // The account area (SCOPE-accounts.md §3): Overview, Households, then My Account's pages.
  const accountItems: NavItem[] = [
    { href: '/account/profile', label: labels.acct.profile, icon: 'user' },
    { href: '/account/notifications', label: labels.acct.notifications, icon: 'bell' },
    { href: '/account/security', label: labels.acct.security, icon: 'lock' },
    { href: '/account/appearance', label: labels.acct.appearance, icon: 'sun' },
  ];
  const developerItems: NavItem[] = view.developer
    ? [{ href: '/console', label: labels.console, icon: 'shield' }]
    : [];
  const items: NavItem[] = account
    ? [
        { href: '/account/overview', label: labels.acct.overview, icon: 'chart' },
        { href: '/account', label: labels.households, icon: 'home' },
        ...accountItems,
        ...developerItems,
      ]
    : [
        { href: '/', label: labels.nav.home, icon: 'home' },
        { href: '/services', label: labels.nav.services, icon: 'services' },
        { href: '/bills', label: labels.nav.bills, icon: 'bills' },
        ...(view.split ? [{ href: '/money', label: labels.nav.money, icon: 'money' }] : []),
        { href: '/members', label: labels.nav.members, icon: 'people' },
        { href: '/inbox', label: labels.nav.inbox, icon: 'inbox', badge: view.inboxCount },
      ];
  // Only words go to the client; the ring's wording is used here.
  const { ring: ringLabel, ...switcherLabels } = labels.switcher;
  const rows: SwitcherRow[] = view.households.map((h) => {
    const pct = h.due.dueMinor > 0 ? Math.min(1, h.due.paidMinor / h.due.dueMinor) : 0;
    const percent = `${Math.round(pct * 100)}%`;
    const left = h.due.dueMinor - h.due.paidMinor;
    const allPaid = h.due.bills > 0 && h.due.paidBills === h.due.bills;
    return {
      memberId: h.memberId,
      name: h.name,
      current: h.current,
      icon: typeIcon(h.type),
      card: {
        pct,
        allPaid,
        percent: h.due.bills > 0 ? percent : '',
        title: `${h.name} · ${formatMonth(h.due.month, h.locale)}`,
        figure: formatMoneyParts(h.monthMinor, h.currency, h.locale),
        sub: allPaid
          ? labels.card.allPaid
          : left > 0
            ? labels.card.toPay(formatMoney(left, h.currency, h.locale))
            : labels.card.nothingDue,
        ringLabel: ringLabel(h.name, percent),
      },
    };
  });
  // The switcher names where you are: a household, or (the account area) all of them.
  const brandTitle = account ? labels.yourHouseholds : view.household.name;
  const brandIcon = account ? 'dashboard' : typeIcon(view.household.type);
  const myRole =
    labels.roles[roleKey(view.me.role, view.household.type)] ??
    (view.me.admin ? labels.admin : labels.member);
  const am = labels.accountMenu;
  // The main places (tiles in the menu, SCOPE-shell.md §3h), then the rest as rows.
  const menuTiles: AccountMenuItem[] = [
    { href: '/account', label: am.dashboardShort, icon: 'dashboard' },
    ...(account
      ? []
      : [
          { href: '/settings', label: am.settingsShort, icon: 'sliders' },
          { href: '/account/notifications', label: am.notifications, icon: 'bell' },
        ]),
    { href: '/account/profile', label: am.profile, icon: 'user' },
    { href: '/account/appearance', label: am.appearance, icon: 'sun' },
    ...(account ? [] : [{ href: '/?edit=1', label: am.editHome, icon: 'pencil' }]),
  ];
  const menuGroups: AccountMenuItem[][] = [
    [
      ...(account ? [] : [{ href: '/wall', label: am.wall, icon: 'wall' }]),
      ...(view.developer ? [{ href: '/console', label: am.backend, icon: 'shield' }] : []),
    ],
  ];
  const menuMe = {
    name: view.me.name,
    colour: view.me.colour,
    photo: view.me.photo,
    sub: view.me.email ?? (account ? labels.account : `${myRole} · ${view.household.name}`),
  };
  const card = account || !view.month ? null : householdCard(view, labels, locale);
  return (
    <div className="app">
      {/* The bar (SCOPE-header.md §3a); on a phone the household card and the
          buttons beside it, with the links in the bar along the bottom. */}
      <header className="topbar">
        <div className="tb-in">
          <div className="tb-start">
            <Link href={account ? '/account/overview' : '/'} className="tb-logo">
              <GarnetMark size={30} />
              <span>{labels.product}</span>
            </Link>
            {/* The household: beside the brand, its icon and name with the
                switcher's arrow; as a card across the top on a phone (§3g). */}
            <div className="tb-hh glass">
              <HouseholdSwitcher
                place="topbar"
                icon={brandIcon}
                title={brandTitle}
                sub={<SectionName items={items} fallback={labels.product} />}
                rows={rows}
                labels={switcherLabels}
                action={switchAction}
                card={card}
              />
            </div>
          </div>
          {/* The links as pills, the current one filled (the phone's are along the bottom). */}
          <nav className="tb-nav" aria-label="Main">
            <NavItems items={items} iconSize={17} />
          </nav>
          <div className="tb-r">
            {!account && <IconButton icon="search" label={labels.search} href="/bills?find=1" />}
            {!account && <AddBillButton address={view.address} className="tb-add" />}
            <AccountMenu
              place="topbar"
              me={menuMe}
              tiles={menuTiles}
              groups={menuGroups}
              signOutLabel={am.signOut}
              signOut={logout}
              openLabel={`${view.me.name} · ${am.open}`}
            >
              <Avatar name={view.me.name} colour={view.me.colour} photo={view.me.photo} />
            </AccountMenu>
          </div>
          {/* Edit Home's bar takes over the bar here (SCOPE-shell.md §3g). */}
          <div id="tb-edit" className="tb-edit" />
        </div>
      </header>

      <main className="main">
        <div className="main-in">
          {/* Edit Home puts Add a widget here, at the page's left edge (SCOPE-header.md §3f). */}
          {!account && <div id="nav-add" className="nav-add" />}
          <div className="page">
            {/* A page's way back lands here (TopBack), on the page, never in the bar. */}
            <span id="tb-back" className="tb-back" />
            <OfflineBar />
            {children}
          </div>
        </div>
      </main>

      {/* A phone's bar keeps five: Members is reached from Settings there. */}
      <nav className="nav glass horizontal bar" aria-label="Main">
        <NavItems
          items={account ? items.slice(0, 5) : items.filter((it) => it.href !== '/members')}
          iconSize={22}
        />
      </nav>
    </div>
  );
}

/**
 * The household as a card (a phone's top card, SCOPE-shell.md §8 Q6): the
 * month's ring (bills paid of bills due this month), the household and
 * month, the month's total as the figure, and what is left to pay.
 */
function householdCard(view: ShellView, labels: ShellLabels, locale: string): ReactNode {
  const m = view.month!;
  const pct = m.dueMinor > 0 ? Math.min(1, m.paidMinor / m.dueMinor) : 0;
  const allPaid = m.bills > 0 && m.paidBills === m.bills;
  const percent = `${Math.round(pct * 100)}%`;
  const fig = formatMoneyParts(m.totalMinor, view.currency, locale);
  const left = m.dueMinor - m.paidMinor;
  return (
    <>
      <StackRing pct={pct} label={labels.card.ring(percent)}>
        {allPaid ? <Icon name="check" width={18} height={18} /> : m.bills > 0 ? percent : null}
      </StackRing>
      <span className="st-hh-t">
        <span>
          {view.household.name} · {formatMonth(m.month, locale)}
        </span>
        <b>
          {fig.main}
          <small>{fig.minor}</small>
          {fig.tail}
        </b>
        <span>
          {allPaid
            ? labels.card.allPaid
            : left > 0
              ? labels.card.toPay(formatMoney(left, view.currency, locale))
              : labels.card.nothingDue}
        </span>
      </span>
    </>
  );
}
