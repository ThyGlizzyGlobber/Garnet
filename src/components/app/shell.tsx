import Link from 'next/link';
import type { ReactNode } from 'react';
import { Avatar } from '@/components/ui/colour';
import { IconButton, SearchField } from '@/components/ui/controls';
import { LinkButton } from '@/components/ui';
import { colourCss } from '@/lib/palette';
import type { ShellView } from '@/lib/shell';
import { Icon } from './icons';
import { NavItems, SectionName, type NavItem } from './nav-items';

/**
 * The app's frame (BRAND.md §9): the scene behind, a floating nav column
 * beside the page (a rail of icons on an iPad, a bottom bar on a phone),
 * and a simple top bar: search, Inbox, Add bill. Layout in
 * src/styles/shell.css; the numbers come from shellView().
 */
export interface ShellLabels {
  nav: { home: string; services: string; bills: string; money: string; inbox: string };
  settings: string;
  addBill: string;
  search: string;
  /** "Just you", for a household of one. */
  justYou: string;
  admin: string;
  member: string;
  servicesHead: string;
  thisMonth: string;
  justYours: string;
  noServices: string;
  /** The product's name, under the household's on a phone's Home. */
  product: string;
  householdHome: string;
}

export function AppShell({
  view,
  labels,
  locale,
  money,
  children,
}: {
  view: ShellView;
  labels: ShellLabels;
  locale: string;
  /** Formats minor units as whole money ("$2,300"). */
  money: (minor: number) => string;
  children: ReactNode;
}) {
  const items: NavItem[] = [
    { href: '/', label: labels.nav.home, icon: 'home' },
    { href: '/services', label: labels.nav.services, icon: 'services' },
    { href: '/bills', label: labels.nav.bills, icon: 'bills' },
    ...(view.split ? [{ href: '/money', label: labels.nav.money, icon: 'money' }] : []),
    { href: '/inbox', label: labels.nav.inbox, icon: 'inbox', badge: view.inboxCount },
  ];
  const who =
    view.household.members.length <= 1
      ? labels.justYou
      : new Intl.ListFormat(locale, { type: 'conjunction' }).format(view.household.members);
  const row = (s: ShellView['services'][number]) => (
    <Link
      key={s.id}
      href={`/services/${s.id}`}
      className="nc-s"
      style={{ ['--svc' as string]: colourCss(s.colour) }}
    >
      <i aria-hidden="true" />
      <span>{s.name}</span>
      <b>{money(s.minor)}</b>
    </Link>
  );
  return (
    <div className="app">
      <nav className="nav glass-strong vertical column" aria-label="Main">
        <Link href="/" className="nc-brand" aria-label={labels.householdHome}>
          <span className="mark">
            <Icon name="home" width={17} height={17} />
          </span>
          <span className="nc-bt">
            <b>{view.household.name}</b>
            <span>{who}</span>
          </span>
        </Link>
        <NavItems items={items} />
        <div className="nc-svcs">
          {view.services.length + view.mine.length > 0 ? (
            <>
              <div className="nav-sec">
                {labels.servicesHead}
                <span>{labels.thisMonth}</span>
              </div>
              {view.services.map(row)}
              {view.mine.length > 0 && (
                <>
                  <div className="nav-sec">{labels.justYours}</div>
                  {view.mine.map(row)}
                </>
              )}
            </>
          ) : (
            <>
              <div className="nav-sec">{labels.servicesHead}</div>
              <p className="nc-empty">{labels.noServices}</p>
            </>
          )}
        </div>
        <Link
          href="/settings"
          className="nc-me"
          aria-label={`${view.me.name} · ${labels.settings}`}
        >
          <Avatar name={view.me.name} colour={view.me.colour} />
          <span className="nc-bt">
            <b>{view.me.name}</b>
            <span>
              {view.me.admin ? labels.admin : labels.member} · {labels.settings}
            </span>
          </span>
          <Icon name="sliders" width={18} height={18} />
        </Link>
      </nav>

      <header className="topbar">
        <div className="tb-l">
          <Link href="/" className="brand" aria-label={labels.householdHome}>
            <span className="mark">
              <Icon name="home" width={17} height={17} />
            </span>
            <span className="brand-t">
              <b>{view.household.name}</b>
              <span>
                <SectionName items={items} fallback={labels.product} />
              </span>
            </span>
          </Link>
          <form action="/bills" method="get" className="tb-search">
            <SearchField placeholder={labels.search} />
          </form>
          <IconButton icon="search" label={labels.search} href="/bills" className="tb-search-btn" />
        </div>
        <div className="tb-r">
          <IconButton
            icon="inbox"
            label={labels.nav.inbox}
            href="/inbox"
            badge={view.inboxCount || undefined}
          />
          <LinkButton href="/bills/new" size="sm" icon="plus" className="tb-add">
            {labels.addBill}
          </LinkButton>
          <Link href="/settings" className="me tb-me" aria-label={labels.settings}>
            <Avatar name={view.me.name} colour={view.me.colour} />
          </Link>
        </div>
      </header>

      <main className="main">
        <div className="main-in">
          <div className="page">{children}</div>
        </div>
      </main>

      <nav className="nav glass-strong horizontal bar" aria-label="Main">
        <NavItems items={items} iconSize={22} />
      </nav>
    </div>
  );
}
