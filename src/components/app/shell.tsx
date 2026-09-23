import Link from 'next/link';
import type { ReactNode } from 'react';
import { Icon } from './icons';
import { NavLinks } from './nav-links';

export interface NavItem {
  href: string;
  label: string;
  icon: string;
}

export function AppShell({
  householdName,
  memberName,
  nav,
  logoutAction,
  logoutLabel,
  settingsHref,
  settingsLabel,
  wallHref,
  wallLabel,
  reviewHref,
  reviewLabel,
  reviewCount,
  children,
}: {
  householdName: string;
  memberName: string;
  nav: NavItem[];
  logoutAction: () => Promise<void>;
  logoutLabel: string;
  settingsHref: string;
  settingsLabel: string;
  wallHref: string;
  wallLabel: string;
  reviewHref: string;
  reviewLabel: string;
  reviewCount: number;
  children: ReactNode;
}) {
  return (
    <div className="min-h-dvh pb-24 md:pb-0">
      <header className="sticky top-0 z-10 border-b border-border bg-bg/80 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3">
          <Link href="/" className="flex items-center gap-2 font-semibold">
            <span className="grid size-8 place-items-center rounded-xl bg-accent text-accent-fg">
              <Icon name="home" width={18} height={18} />
            </span>
            <span className="truncate">{householdName}</span>
          </Link>
          <nav className="hidden items-center gap-1 md:flex">
            <NavLinks items={nav} variant="top" />
          </nav>
          <form action={logoutAction} className="flex items-center gap-2 text-sm">
            <span className="hidden text-fg-muted sm:inline">{memberName}</span>
            <Link
              href={reviewHref}
              title={reviewLabel}
              aria-label={reviewLabel}
              className="relative rounded-full p-2 text-fg-muted hover:bg-surface-2 hover:text-fg"
            >
              <Icon name="inbox" width={20} height={20} />
              {reviewCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 grid min-w-4 place-items-center rounded-full bg-warning px-1 text-[10px] font-bold text-white">
                  {reviewCount}
                </span>
              )}
            </Link>
            <Link
              href={wallHref}
              title={wallLabel}
              aria-label={wallLabel}
              className="hidden rounded-full p-2 text-fg-muted hover:bg-surface-2 hover:text-fg md:inline-flex"
            >
              <Icon name="wall" width={20} height={20} />
            </Link>
            <Link
              href={settingsHref}
              title={settingsLabel}
              aria-label={settingsLabel}
              className="rounded-full p-2 text-fg-muted hover:bg-surface-2 hover:text-fg"
            >
              <Icon name="gear" width={20} height={20} />
            </Link>
            <button className="rounded-full bg-surface-2 px-3 py-1.5 font-medium hover:bg-border">
              {logoutLabel}
            </button>
          </form>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
      <nav className="fixed inset-x-0 bottom-0 z-10 border-t border-border bg-bg/90 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
        <div className="mx-auto flex max-w-md justify-around">
          <NavLinks items={nav} variant="bottom" />
        </div>
      </nav>
    </div>
  );
}
