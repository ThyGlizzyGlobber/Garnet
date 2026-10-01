import Link from 'next/link';
import type { ReactNode } from 'react';
import { Avatar } from '@/components/ui/colour';
import { IconButton } from '@/components/ui/controls';
import { colourCss } from '@/lib/palette';
import type { ShellEntry, ShellView } from '@/lib/shell';
import { AddBillButton } from './add-bill';
import { Icon } from './icons';
import { NavGroup } from './nav-group';
import { NavSection } from './nav-section';
import { OfflineBar } from './offline-bar';
import { NavItems, SectionName, type NavItem } from './nav-items';
import { HouseholdSwitcher, type SwitcherLabels, type SwitcherRow } from './household-switcher';
import { roleKey, typeIcon } from '@/lib/household-types';

/**
 * The app's frame (BRAND.md §9): the scene behind, a floating nav column
 * beside the page (a rail of icons on an iPad, a bottom bar on a phone),
 * and a simple top bar: the page's way back on the left; search and Add bill
 * on the right (the Inbox is in the nav). Layout in
 * src/styles/shell.css; the numbers come from shellView().
 */
export interface ShellLabels {
  nav: { home: string; services: string; bills: string; money: string; inbox: string };
  settings: string;
  search: string;
  /** "Just you", for a household of one. */
  justYou: string;
  admin: string;
  member: string;
  /** Role names by roleKey (Admin, Owner/Landlord, Tenant…). */
  roles: Record<string, string>;
  servicesHead: string;
  /** The nav's two service sections: the everyday bills, and the rest. */
  essentials: string;
  everythingElse: string;
  /** A section heading's fold: "Show" / "Hide". */
  showSection: string;
  hideSection: string;
  thisMonth: string;
  justYours: string;
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
  /** "Your households", under the product's name in the account variant. */
  yourHouseholds: string;
  switcher: SwitcherLabels;
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
  const items: NavItem[] = account
    ? [
        { href: '/account', label: labels.households, icon: 'grid' },
        { href: '/account#account', label: labels.account, icon: 'user' },
        ...(view.developer ? [{ href: '/console', label: labels.console, icon: 'sliders' }] : []),
      ]
    : [
        { href: '/', label: labels.nav.home, icon: 'home' },
        { href: '/services', label: labels.nav.services, icon: 'services' },
        { href: '/bills', label: labels.nav.bills, icon: 'bills' },
        ...(view.split ? [{ href: '/money', label: labels.nav.money, icon: 'money' }] : []),
        { href: '/inbox', label: labels.nav.inbox, icon: 'inbox', badge: view.inboxCount },
      ];
  const rows: SwitcherRow[] = view.households.map((h) => ({
    memberId: h.memberId,
    name: h.name,
    primary: h.primary,
    current: h.current,
    role: labels.roles[roleKey(h.role, h.type)] ?? (h.admin ? labels.admin : labels.member),
    icon: typeIcon(h.type),
    figure: h.oweMinor > 0 ? money(h.oweMinor, h.currency, h.locale) : null,
    attention: h.waiting > 0 || h.overdue > 0,
  }));
  const meHref = account ? '/account#account' : '/settings';
  const brandTitle = account ? labels.product : view.household.name;
  const brandIcon = account ? 'grid' : typeIcon(view.household.type);
  const myRole =
    labels.roles[roleKey(view.me.role, view.household.type)] ??
    (view.me.admin ? labels.admin : labels.member);
  const who =
    view.household.members.length <= 1
      ? labels.justYou
      : new Intl.ListFormat(locale, { type: 'conjunction' }).format(view.household.members);
  const line = (s: { name: string; minor: number }) => (
    <>
      <i aria-hidden="true" />
      <span>{s.name}</span>
      <b>{money(s.minor, view.currency, locale)}</b>
    </>
  );
  const essentials = view.services.filter((s) => s.kind === 'service' && s.essential);
  const others = view.services.filter((s) => !(s.kind === 'service' && s.essential));
  const row = (s: ShellEntry) =>
    s.kind === 'group' ? (
      <NavGroup
        key={s.key}
        href={s.href}
        childHrefs={s.children.map((c) => c.href)}
        label={s.category ? (labels.main[s.category] ?? s.name) : s.name}
        showLabel={labels.showSubs}
        hideLabel={labels.hideSubs}
        colour={colourCss(s.colour)}
        row={line(s.category ? { ...s, name: labels.main[s.category] ?? s.name } : s)}
      >
        {s.children.map((c) => (
          <Link
            key={c.id}
            href={c.href}
            className="nc-s nc-sub"
            style={{ ['--svc' as string]: colourCss(c.colour) }}
          >
            {line(c)}
          </Link>
        ))}
      </NavGroup>
    ) : (
      <Link
        key={s.id}
        href={s.href}
        className="nc-s"
        style={{ ['--svc' as string]: colourCss(s.colour) }}
      >
        {line(s)}
      </Link>
    );
  return (
    <div className="app">
      <nav className="nav glass-strong vertical column" aria-label="Main">
        <HouseholdSwitcher
          place="column"
          icon={brandIcon}
          title={brandTitle}
          sub={account ? labels.yourHouseholds : who}
          rows={rows}
          labels={labels.switcher}
          action={switchAction}
        />
        <NavItems items={items} />
        <div className="nc-svcs">
          {account ? null : view.services.length + view.mine.length > 0 ? (
            <>
              {/* The everyday bills first, then the main services and the rest;
                  each section folds away from its heading. */}
              {essentials.length > 0 && (
                <NavSection
                  id="essentials"
                  title={labels.essentials}
                  aside={labels.thisMonth}
                  showLabel={labels.showSection}
                  hideLabel={labels.hideSection}
                >
                  {essentials.map(row)}
                </NavSection>
              )}
              {others.length > 0 && (
                <NavSection
                  id="everything-else"
                  title={labels.everythingElse}
                  aside={essentials.length === 0 ? labels.thisMonth : undefined}
                  showLabel={labels.showSection}
                  hideLabel={labels.hideSection}
                >
                  {others.map(row)}
                </NavSection>
              )}
              {view.mine.length > 0 && (
                <NavSection
                  id="just-yours"
                  title={labels.justYours}
                  showLabel={labels.showSection}
                  hideLabel={labels.hideSection}
                >
                  {view.mine.map(row)}
                </NavSection>
              )}
            </>
          ) : (
            <>
              <div className="nav-sec">{labels.servicesHead}</div>
              <p className="nc-empty">{labels.noServices}</p>
            </>
          )}
        </div>
        <Link href={meHref} className="nc-me" aria-label={`${view.me.name} · ${labels.settings}`}>
          <Avatar name={view.me.name} colour={view.me.colour} />
          <span className="nc-bt">
            <b>{view.me.name}</b>
            <span>{account ? labels.account : `${myRole} · ${labels.settings}`}</span>
          </span>
          <Icon name="sliders" width={18} height={18} />
        </Link>
      </nav>

      <header className="topbar">
        <div className="tb-l">
          <HouseholdSwitcher
            place="topbar"
            icon={brandIcon}
            title={brandTitle}
            sub={<SectionName items={items} fallback={labels.product} />}
            rows={rows}
            labels={labels.switcher}
            action={switchAction}
          />
          {/* A page's way back lands here (TopBack). */}
          <span id="tb-back" className="tb-back" />
        </div>
        <div className="tb-r">
          {!account && <IconButton icon="search" label={labels.search} href="/bills?find=1" />}
          {!account && <AddBillButton address={view.address} className="tb-add" />}
          <Link href={meHref} className="me tb-me" aria-label={labels.settings}>
            <Avatar name={view.me.name} colour={view.me.colour} />
          </Link>
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

      <nav className="nav glass-strong horizontal bar" aria-label="Main">
        <NavItems items={items} iconSize={22} />
      </nav>
    </div>
  );
}
