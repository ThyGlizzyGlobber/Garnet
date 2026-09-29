import Link from 'next/link';
import type { ReactNode } from 'react';
import { Icon } from './icons';
import { Avatar } from '@/components/ui/colour';
import { NavLinks } from './nav-links';

export interface NavItem {
  href: string;
  label: string;
  icon: string;
}

/**
 * App frame: ambient scene → one big frosted window holding the top bar and
 * content → floating segmented nav pill.
 */
export function AppShell({
  householdName,
  memberName,
  memberColour,
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
  searchLabel,
  children,
}: {
  householdName: string;
  memberName: string;
  memberColour: string;
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
  searchLabel: string;
  children: ReactNode;
}) {
  const iconBtn =
    'relative grid size-11 place-items-center rounded-full bg-surface-2 text-fg transition hover:bg-border-strong';
  return (
    <div className="min-h-dvh px-3 pt-3 pb-32 sm:px-6 sm:pt-6">
      <div className="window mx-auto max-w-[1400px] px-4 pt-4 pb-8 sm:px-8 sm:pt-6 sm:pb-10">
        <header className="flex items-center justify-between gap-4">
          <Link
            href="/"
            className="flex min-w-0 items-center gap-2.5 font-display text-lg font-bold"
          >
            <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-accent text-accent-fg">
              <Icon name="home" width={19} height={19} />
            </span>
            <span className="truncate">{householdName}</span>
          </Link>
          <form
            action="/bills"
            method="get"
            className="hidden min-w-0 flex-1 justify-center md:flex"
          >
            <label className="flex h-11 w-full max-w-md items-center gap-3 rounded-full bg-surface-2 px-4 text-fg-muted">
              <Icon name="search" width={18} height={18} />
              <input
                name="q"
                type="search"
                placeholder={searchLabel}
                className="min-w-0 flex-1 bg-transparent text-sm text-fg outline-none placeholder:text-fg-muted"
              />
            </label>
          </form>
          <div className="flex items-center gap-2">
            <Link
              href={reviewHref}
              title={reviewLabel}
              aria-label={reviewLabel}
              className={iconBtn}
            >
              <Icon name="inbox" width={19} height={19} />
              {reviewCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 grid min-w-4 place-items-center rounded-full bg-warning px-1 text-[11px] font-bold text-bg">
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
            <form action={logoutAction} className="hidden items-center sm:flex">
              <button
                title={logoutLabel}
                className="flex h-11 items-center gap-2 rounded-full bg-surface-2 py-1 pr-3 pl-1 text-sm font-semibold hover:bg-border-strong"
              >
                <Avatar name={memberName} colour={memberColour} className="size-8 text-xs" />
                {memberName}
              </button>
            </form>
            <Link
              href={addHref}
              className="inline-flex h-11 items-center gap-2 rounded-full bg-accent px-4 text-sm font-bold text-accent-fg hover:opacity-90 sm:px-5"
            >
              <Icon name="plus" width={18} height={18} />
              <span className="hidden sm:inline">{addLabel}</span>
            </Link>
          </div>
        </header>
        <main className="pt-7">{children}</main>
      </div>
      <nav className="fixed inset-x-0 bottom-[max(16px,env(safe-area-inset-bottom))] z-10 flex justify-center px-3 sm:bottom-7">
        <div className="glass-nav flex w-full max-w-md gap-1 rounded-full p-1.5 sm:w-auto sm:max-w-none sm:gap-1.5 sm:p-2">
          <NavLinks items={nav} />
        </div>
      </nav>
    </div>
  );
}
