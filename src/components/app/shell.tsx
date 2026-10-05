import Link from 'next/link';
import type { ReactNode } from 'react';
import { Avatar } from '@/components/ui/colour';
import { IconButton } from '@/components/ui/controls';
import { formatMoney, formatMoneyParts, formatMonth } from '@/lib/format';
import { colourCss } from '@/lib/palette';
import type { ShellEntry, ShellView } from '@/lib/shell';
import { logout } from '@/app/login/actions';
import { AccountMenu, type AccountMenuItem } from './account-menu';
import { AddBillButton } from './add-bill';
import { GarnetMark } from './garnet-mark';
import { Icon } from './icons';
import { NavGroup } from './nav-group';
import { NavHouseholds } from './nav-households';
import { NavServices } from './nav-services';
import { OfflineBar } from './offline-bar';
import { StackRing } from './stack-ring';
import { NavItems, SectionName, type NavItem } from './nav-items';
import { HouseholdSwitcher, type SwitcherLabels, type SwitcherRow } from './household-switcher';
import { roleKey, typeIcon } from '@/lib/household-types';

/**
 * The app's frame (BRAND.md §9, SCOPE-shell.md): the scene behind, and on a
 * desktop one frame shared by the menu and the page. The menu is a stack of
 * glass cards (the household with its month ring, the links as tiles, the
 * services, your own services, you); a rail of icons on an iPad and a bottom
 * bar on a phone for now. The top line holds the page's way back on the left
 * and search and Add bill on the right. The household card drops down the
 * switcher; your card opens the account menu. Layout in
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
  settings: string;
  search: string;
  /** Under the household's name: "3 Members" (owner's wording). */
  people: (count: number) => string;
  admin: string;
  member: string;
  /** Role names by roleKey (Admin, Owner/Landlord, Tenant…). */
  roles: Record<string, string>;
  /** The household card's words (the desktop menu). */
  card: {
    toPay: (amount: string) => string;
    allPaid: string;
    nothingDue: string;
    /** The ring, for screen readers: "12% of this month's bills paid". */
    ring: (percent: string) => string;
  };
  servicesHead: string;
  thisMonth: string;
  /** The services in no group, once there are groups. */
  otherServices: string;
  /** The viewer's own services, last. */
  myServices: string;
  noServices: string;
  /** The arrow on a main service with sub-services. */
  showSubs: string;
  /** Categories that are main services: "Vehicles", "Health". */
  main: Record<string, string>;
  hideSubs: string;
  /** The product's name, under the household's on a phone's Home. */
  product: string;
  householdHome: string;
  /** The Account Dashboard's nav (the account variant). */
  households: string;
  account: string;
  console: string;
  /** "Your households": the switcher's name in the account area. */
  yourHouseholds: string;
  /** Under it: "3 Households". */
  householdCount: (count: number) => string;
  /** The account area's menu: Overview, then My Account's pages. */
  acct: {
    overview: string;
    myAccount: string;
    profile: string;
    notifications: string;
    security: string;
    appearance: string;
    developer: string;
    /** Beside the primary household in the menu. */
    primary: string;
  };
  switcher: SwitcherLabels & {
    /** A household's ring, for screen readers: "Maple Street: 64% of this month's bills paid". */
    ring: (name: string, percent: string) => string;
  };
  accountMenu: {
    open: string;
    dashboard: string;
    settings: string;
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
  money,
  variant = 'household',
  switchAction,
  children,
}: {
  view: ShellView;
  labels: ShellLabels;
  locale: string;
  /** Formats minor units as whole money ("$2,300"). */
  money: (minor: number, currency: string, locale: string) => string;
  /** The household frame, or the Account Dashboard's (no household, no services). */
  variant?: 'household' | 'account';
  /** Opens the household whose member id is posted (the switcher). */
  switchAction: (fd: FormData) => Promise<void>;
  children: ReactNode;
}) {
  const account = variant === 'account';
  // The account area (SCOPE-accounts.md §3): its households, then My Account.
  const accountItems: NavItem[] = [
    { href: '/account/profile', label: labels.acct.profile, icon: 'user' },
    { href: '/account/notifications', label: labels.acct.notifications, icon: 'bell' },
    { href: '/account/security', label: labels.acct.security, icon: 'lock' },
    { href: '/account/appearance', label: labels.acct.appearance, icon: 'sun' },
  ];
  const developerItems: NavItem[] = view.developer
    ? [{ href: '/console', label: labels.console, icon: 'shield' }]
    : [];
  // Overview first, then Households (owner, 2026-10-02).
  const overview: NavItem = {
    href: '/account/overview',
    label: labels.acct.overview,
    icon: 'chart',
  };
  const householdsItem: NavItem = { href: '/account', label: labels.households, icon: 'home' };
  const allAccountItems = [overview, householdsItem, ...accountItems, ...developerItems];
  const items: NavItem[] = account
    ? [overview, householdsItem]
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
  const who = labels.people(view.household.members.length);
  const am = labels.accountMenu;
  // The main places (tiles in the desktop menu, SCOPE-shell.md §3h), then the rest as rows.
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
  const line = (s: { name: string; minor: number }) => (
    <>
      <i aria-hidden="true" />
      <span>{s.name}</span>
      {/* Nothing due on it this month: a dash, not a zero. */}
      <b>{s.minor ? money(s.minor, view.currency, locale) : '—'}</b>
    </>
  );
  const nameOf = (s: ShellEntry) =>
    s.kind === 'group' && s.category ? (labels.main[s.category] ?? s.name) : s.name;
  const card = account || !view.month ? null : householdCard(view, labels, locale);
  const anyServices = [...view.sections, ...view.mine].some((sec) => sec.entries.length > 0);
  const asSections = (secs: ShellView['sections']) =>
    secs.map((sec) => ({
      id: sec.group?.id ?? null,
      name: sec.group?.name ?? '',
      keys: sec.entries.map((e) => e.key),
    }));
  const row = (s: ShellEntry) =>
    s.kind === 'group' ? (
      <NavGroup
        key={s.key}
        href={s.href}
        groupKey={s.key}
        arrange={view.me.admin || s.key.startsWith('m')}
        label={nameOf(s)}
        showLabel={labels.showSubs}
        hideLabel={labels.hideSubs}
        colour={colourCss(s.colour)}
        row={line({ ...s, name: nameOf(s) })}
        items={s.children.map((c) => ({
          id: c.id,
          href: c.href,
          node: (
            <Link
              href={c.href}
              draggable={false}
              className="nc-s nc-sub"
              style={{ ['--svc' as string]: colourCss(c.colour) }}
            >
              {line(c)}
            </Link>
          ),
        }))}
      />
    ) : (
      <Link
        key={s.id}
        href={s.href}
        draggable={false}
        className="nc-s"
        style={{ ['--svc' as string]: colourCss(s.colour) }}
      >
        {line(s)}
      </Link>
    );
  return (
    <div className="app">
      {/* The same column everywhere (owner, 2026-10-02): the brand, where you
          are (the switcher), the main links, headed sections, and you. */}
      <nav className="nav vertical column" aria-label="Main">
        <Link href={account ? '/account/overview' : '/'} className="nc-logo">
          <GarnetMark size={30} />
          <span>{labels.product}</span>
        </Link>
        <div className="glass st-card st-hh">
          <HouseholdSwitcher
            place="column"
            icon={brandIcon}
            title={brandTitle}
            sub={account ? labels.householdCount(view.households.length) : who}
            rows={rows}
            labels={switcherLabels}
            action={switchAction}
            card={card}
          />
        </div>
        {account ? (
          <div className="nav-items nc-acct-top glass st-card">
            <NavItems items={[overview]} among={allAccountItems} />
            <NavHouseholds
              label={labels.households}
              households={view.households.map((h) => ({
                memberId: h.memberId,
                name: h.name,
                icon: typeIcon(h.type),
                primary: h.primary,
              }))}
              labels={{
                primary: labels.acct.primary,
                open: labels.switcher.open,
                show: labels.showSubs,
                hide: labels.hideSubs,
              }}
              action={switchAction}
            />
          </div>
        ) : (
          <div className="glass st-card st-links">
            <NavItems items={items} />
          </div>
        )}
        {account && (
          <div className="nc-acct glass st-card">
            <div className="nav-sec">{labels.acct.myAccount}</div>
            <NavItems items={accountItems} among={allAccountItems} />
            {developerItems.length > 0 && (
              <>
                <div className="nav-sec">{labels.acct.developer}</div>
                <NavItems items={developerItems} among={allAccountItems} />
              </>
            )}
          </div>
        )}
        <div className="nc-svcs">
          {account ? null : anyServices ? (
            <>
              {/* The person's own groups in their order, then the services in
                  no group; the pencil arranges them in place. */}
              <NavServices
                sections={asSections(view.sections)}
                mine={asSections(view.mine)}
                rows={[...view.sections, ...view.mine]
                  .flatMap((sec) => sec.entries)
                  .map((e) => ({
                    key: e.key,
                    node: row(e),
                  }))}
                lines={view.lines}
                admin={view.me.admin}
                labels={{
                  head: labels.servicesHead,
                  thisMonth: labels.thisMonth,
                  other: labels.otherServices,
                  mine: labels.myServices,
                }}
              />
            </>
          ) : (
            <div className="glass st-card">
              <div className="nav-sec">{labels.servicesHead}</div>
              <p className="nc-empty">{labels.noServices}</p>
            </div>
          )}
        </div>
        <div className="glass st-card st-me">
          <AccountMenu
            place="column"
            me={menuMe}
            tiles={menuTiles}
            groups={menuGroups}
            signOutLabel={am.signOut}
            signOut={logout}
            openLabel={`${view.me.name} · ${am.open}`}
          >
            <Avatar name={view.me.name} colour={view.me.colour} photo={view.me.photo} />
            <span className="nc-bt">
              <b>{view.me.name}</b>
              <span className="nc-role">{account ? labels.account : myRole}</span>
              {view.me.email && <span className="nc-email">{view.me.email}</span>}
            </span>
            <Icon name="more" width={18} height={18} />
          </AccountMenu>
        </div>
      </nav>

      <header className="topbar">
        <div className="tb-l">
          <HouseholdSwitcher
            place="topbar"
            icon={brandIcon}
            title={brandTitle}
            sub={<SectionName items={items} fallback={labels.product} />}
            rows={rows}
            labels={switcherLabels}
            action={switchAction}
          />
          {/* A page's way back lands here (TopBack). */}
          <span id="tb-back" className="tb-back" />
        </div>
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
      </header>

      <main className="main">
        <div className="main-in">
          <div className="page">
            <OfflineBar />
            {children}
          </div>
        </div>
      </main>

      {/* A phone's bar keeps five: Members is reached from Settings there. */}
      <nav className="nav glass-strong horizontal bar" aria-label="Main">
        <NavItems
          items={
            account
              ? [...items, ...accountItems.slice(0, 3)]
              : items.filter((it) => it.href !== '/members')
          }
          iconSize={22}
        />
      </nav>
    </div>
  );
}

/**
 * The household as a card (SCOPE-shell.md §3b): the month's ring (bills paid
 * of bills due this month), the household and month, the month's total as
 * the figure, and what is left to pay.
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
