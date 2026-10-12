import Link from 'next/link';
import type { ReactNode } from 'react';
import { Avatar } from '@/components/ui/colour';
import { IconButton } from '@/components/ui/controls';
import { formatMoney, formatMoneyParts, formatMonth } from '@/lib/format';
import { colourCss } from '@/lib/palette';
import type { ShellEntry, ShellStatus, ShellView } from '@/lib/shell';
import { ServicesPanel, type PanelRow, type PanelSection } from './services-panel';
import { logout } from '@/app/login/actions';
import { AccountMenu, type AccountMenuItem } from './account-menu';
import { AddBillButton } from './add-bill';
import { BarScroll } from './bar-scroll';
import { GarnetMark } from './garnet-mark';
import { Icon } from './icons';
import { OfflineBar } from './offline-bar';
import { StackRing } from './stack-ring';
import { NavItems, SectionName, type NavItem } from './nav-items';
import { HouseholdSwitcher, type SwitcherLabels, type SwitcherRow } from './household-switcher';
import { roleKey, typeIcon } from '@/lib/household-types';

/**
 * The app's frame (BRAND.md §9, SCOPE-redesign-2.md §3 TopNav): the scene
 * behind, and on a desktop or an iPad on its side one pill bar across the
 * top: the brand and the household on the left, the links as pills in the
 * middle (Home, Services, Bills, Budget, Members, Inbox; Money after Budget
 * where bills are split), search, Add bill and you on the right. The household's name drops its switcher,
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
    budget: string;
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
  /** Categories that are main services: "Vehicles", "Health". */
  main: Record<string, string>;
  /** The bar's Services panel (SCOPE-header.md §3c). */
  panel: {
    title: string;
    all: (amount: string) => string;
    toPayWeek: (count: number) => string;
    add: string;
    open: (name: string) => string;
    parts: string;
    nothing: string;
    none: string;
    /** "Paid", "3 days overdue", "Due 12 Oct": the ui.status words. */
    status: (key: string, n: number, date: string) => string;
    otherServices: string;
    myServices: string;
  };
  /** The product's name, under the household's on a phone's Home. */
  product: string;
  /** The Account Dashboard's nav (the account variant). */
  households: string;
  account: string;
  console: string;
  /** "Your households": the switcher's name in the account area. */
  yourHouseholds: string;
  /** The account area's three pills (SCOPE-redesign-2.md §4): Households, Notifications, Account. */
  acct: {
    households: string;
    notifications: string;
    account: string;
  };
  switcher: SwitcherLabels & {
    /** A household's ring, for screen readers: "Maple Street: 64% of this month's bills paid". */
    ring: (name: string, percent: string) => string;
  };
  accountMenu: {
    open: string;
    notifications: string;
    account: string;
    wall: string;
    backend: string;
    signOut: string;
    /** The tiles' shorter names. */
    dashboardShort: string;
    settingsShort: string;
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
  // The account area (SCOPE-redesign-2.md §4): Households, Notifications, Account.
  const developerItems: NavItem[] = view.developer
    ? [{ href: '/console', label: labels.console, icon: 'shield' }]
    : [];
  // The three money views sit together: Bills, Budget, then Money where bills are split.
  const items: NavItem[] = account
    ? [
        { href: '/account', label: labels.acct.households, icon: 'home' },
        { href: '/account/notifications', label: labels.acct.notifications, icon: 'bell' },
        { href: '/account/profile', label: labels.acct.account, icon: 'user' },
        ...developerItems,
      ]
    : [
        { href: '/', label: labels.nav.home, icon: 'home' },
        { href: '/services', label: labels.nav.services, icon: 'services' },
        { href: '/bills', label: labels.nav.bills, icon: 'bills' },
        { href: '/budget', label: labels.nav.budget, icon: 'wallet' },
        ...(view.split
          ? [{ href: '/money', label: labels.nav.money, icon: 'money', badge: view.owedBy }]
          : []),
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
  // The main places, then the rest as rows.
  const menuTiles: AccountMenuItem[] = [
    { href: '/account', label: am.dashboardShort, icon: 'dashboard' },
    ...(account
      ? []
      : [
          { href: '/settings', label: am.settingsShort, icon: 'sliders' },
          { href: '/account/notifications', label: am.notifications, icon: 'bell' },
        ]),
    { href: '/account/profile', label: am.account, icon: 'user' },
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
  const panel = account ? null : servicesPanel(view, labels, locale);
  return (
    <div className="app">
      {/* The bar (SCOPE-header.md §3a); on a phone the household card and the
          buttons beside it, with the links in the bar along the bottom. */}
      <header className="topbar">
        <BarScroll />
        <div className="tb-in">
          <div className="tb-start">
            <Link href={account ? '/account' : '/'} className="tb-logo">
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
            <NavItems
              items={items}
              iconSize={17}
              panels={panel ? { '/services': panel } : undefined}
            />
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
        </div>
      </header>

      <main className="main">
        <div className="main-in">
          <div className="page">
            {/* A page's way back lands here (TopBack), on the page, never in the bar. */}
            <span id="tb-back" className="tb-back" />
            <OfflineBar />
            {children}
          </div>
        </div>
      </main>

      {/* A phone's bar leaves Members out (it's reached from Settings there). */}
      <nav className="nav glass-strong horizontal bar" aria-label="Main">
        <NavItems items={items.filter((it) => it.href !== '/members')} iconSize={22} />
      </nav>
    </div>
  );
}

/**
 * The bar's Services panel (SCOPE-header.md §3c): every service as a row
 * led by its ring and where it stands, in the household's groups with their
 * totals, then My Services, worded here from shellView().
 */
function servicesPanel(view: ShellView, labels: ShellLabels, locale: string): ReactNode {
  const money = (minor: number) => formatMoney(minor, view.currency, locale, { whole: true });
  const figure = (minor: number) => (minor ? money(minor) : '—');
  const dm = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', timeZone: 'UTC' });
  const dmy = new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
  const thisYear = view.month?.month.slice(0, 4);
  const date = (ymd: string) =>
    (ymd.slice(0, 4) === thisYear ? dm : dmy).format(new Date(`${ymd}T00:00:00Z`));
  // The ring: filled by the days left (full at 30 and over), a tick when paid,
  // Pyrope when overdue, empty when nothing is due this month.
  const ring = (s: ShellStatus): PanelRow['ring'] & { status: string } => {
    if (!s) return { pct: 0, centre: '', tick: false, tone: 'none', status: labels.panel.nothing };
    const status = labels.panel.status(s.key, Math.abs(s.days), date(s.dueDate));
    if (s.key === 'paid') return { pct: 1, centre: '', tick: true, tone: 'ok', status };
    if (s.key === 'overdue')
      return { pct: 1, centre: String(-s.days), tick: false, tone: 'bad', status };
    return {
      pct: 1 - Math.min(s.days, 30) / 30,
      centre: String(s.days),
      tick: false,
      tone: s.days <= 7 ? 'warn' : 'neutral',
      status,
    };
  };
  const nameOf = (e: ShellEntry) =>
    e.kind === 'group' && e.category ? (labels.main[e.category] ?? e.name) : e.name;
  const row = (e: ShellEntry): PanelRow => {
    const { status, ...r } = ring(e.status);
    return {
      key: e.key,
      href: e.href,
      name: nameOf(e),
      colour: colourCss(e.colour),
      figure: figure(e.minor),
      ring: r,
      status,
      children:
        e.kind === 'group'
          ? e.children.map((c) => ({
              id: c.id,
              href: c.href,
              name: c.name,
              figure: figure(c.minor),
            }))
          : undefined,
      openLabel: e.kind === 'group' ? labels.panel.open(nameOf(e)) : undefined,
    };
  };
  const sectionsOf = (secs: ShellView['sections'], other: string): PanelSection[] =>
    secs.map((sec) => ({
      name: sec.group?.name ?? (secs.length > 1 ? other : ''),
      total: money(sec.entries.reduce((sum, e) => sum + e.minor, 0)),
      rows: sec.entries.map(row),
    }));
  const sections = sectionsOf(view.sections, labels.panel.otherServices);
  // The household's services in no group, headed "Services" when they are the only section.
  if (sections.length === 1 && !sections[0]!.name) sections[0]!.name = labels.panel.title;
  const mine = sectionsOf(view.mine, labels.panel.otherServices).map((s) => ({
    ...s,
    name: s.name ? `${labels.panel.myServices} · ${s.name}` : labels.panel.myServices,
  }));
  const total = view.month ? money(view.month.totalMinor) : money(0);
  return (
    <ServicesPanel
      sections={sections}
      mine={mine}
      labels={{
        title: labels.panel.title,
        all: `${labels.panel.all(total)} · ${labels.panel.toPayWeek(view.toPayWeek)}`,
        add: labels.panel.add,
        parts: labels.panel.parts,
        none: labels.panel.none,
      }}
    />
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
