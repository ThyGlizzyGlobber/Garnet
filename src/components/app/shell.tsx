import Link from 'next/link';
import type { ReactNode } from 'react';
import { Icon } from './icons';
import { NavLinks } from './nav-links';

export interface NavItem {
  href: string;
  label: string;
  icon: string;
}

/**
 * App frame from the Phase 4 mockups: glass top bar (brand, actions, account),
 * content, and a floating segmented nav pill at the bottom on every breakpoint.
 */
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
  addHref,
  addLabel,
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
  addHref: string;
  addLabel: string;
  children: ReactNode;
}) {
  const iconBtn =
    'glass relative grid size-11 place-items-center rounded-full text-fg transition hover:bg-surface-2';
  return (
    <div className="min-h-dvh pb-36">
      <header className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 pt-5 sm:px-6">
        <Link href="/" className="flex items-center gap-2.5 font-display text-lg font-bold">
          <span className="grid size-9 place-items-center rounded-xl bg-accent text-accent-fg">
            <Icon name="home" width={19} height={19} />
          </span>
          <span className="truncate">{householdName}</span>
        </Link>
        <div className="flex items-center gap-2.5">
          <Link href={reviewHref} title={reviewLabel} aria-label={reviewLabel} className={iconBtn}>
            <Icon name="inbox" width={19} height={19} />
            {reviewCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 grid min-w-4 place-items-center rounded-full bg-warning px-1 text-[10px] font-bold text-bg">
                {reviewCount}
              </span>
            )}
          </Link>
          <Link
            href={wallHref}
            title={wallLabel}
            aria-label={wallLabel}
            className={`${iconBtn} hidden md:grid`}
          >
            <Icon name="wall" width={19} height={19} />
          </Link>
          <Link
            href={settingsHref}
            title={settingsLabel}
            aria-label={settingsLabel}
            className={iconBtn}
          >
            <Icon name="gear" width={19} height={19} />
          </Link>
          <form action={logoutAction} className="hidden items-center gap-2 sm:flex">
            <span className="glass flex h-11 items-center gap-2 rounded-full py-1 pr-3 pl-1">
              <span className="size-8 rounded-full bg-gradient-to-br from-[#5b6f82] to-[#8fa6bd]" />
              <span className="text-sm font-semibold">{memberName}</span>
            </span>
            <button className="rounded-full px-3 py-2 text-sm font-medium text-fg-muted hover:text-fg">
              {logoutLabel}
            </button>
          </form>
          <span className="hidden h-6 w-px bg-border-strong sm:block" />
          <Link
            href={addHref}
            className="inline-flex h-11 items-center gap-2 rounded-full bg-accent px-4 text-sm font-bold text-accent-fg hover:opacity-90 sm:px-5"
          >
            <Icon name="plus" width={18} height={18} />
            <span className="hidden sm:inline">{addLabel}</span>
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6">{children}</main>
      <nav className="fixed inset-x-0 bottom-[max(16px,env(safe-area-inset-bottom))] z-10 flex justify-center px-3 sm:bottom-7">
        <div className="glass flex w-full max-w-md gap-1 rounded-full p-1.5 sm:w-auto sm:max-w-none sm:gap-1.5 sm:p-2">
          <NavLinks items={nav} variant="segment" />
        </div>
      </nav>
    </div>
  );
}
