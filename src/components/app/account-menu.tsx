'use client';

import Link from 'next/link';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Avatar } from '@/components/ui/colour';
import { cx } from '@/components/ui/cx';
import { Icon } from './icons';

export interface AccountMenuItem {
  href: string;
  label: string;
  icon: string;
}

/**
 * The account menu (owner, 2026-10-02): the person at the foot of the nav
 * column opens a menu of their name and email, the Account Dashboard, the
 * household's settings and the rest, and Sign out in red. A click, tap or
 * Enter opens it (owner: clickable, not on hover); Escape or a click
 * elsewhere closes it.
 */
export function AccountMenu({
  place,
  me,
  groups,
  signOutLabel,
  signOut,
  openLabel,
  children,
}: {
  /** The nav column's foot (the menu rises beside it), or the phone top bar's avatar (it drops). */
  place: 'column' | 'topbar';
  me: { name: string; colour: string; sub: string };
  /** Groups of links, divided by a line. */
  groups: AccountMenuItem[][];
  signOutLabel: string;
  signOut: () => Promise<void>;
  openLabel: string;
  /** What the trigger shows (the avatar, and in the column the name and role). */
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setOpen(false);
      box.current?.querySelector<HTMLButtonElement>('.am-trigger')?.focus();
    };
    document.addEventListener('click', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('click', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);
  return (
    <div ref={box} className={cx('am', place === 'column' ? 'am-column' : 'am-topbar')}>
      <button
        type="button"
        className={cx('am-trigger', place === 'column' ? 'nc-me' : 'me tb-me')}
        aria-label={openLabel}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        {children}
      </button>
      {open && (
        <div className="am-menu" role="menu" aria-label={openLabel}>
          <div className="am-who">
            <Avatar name={me.name} colour={me.colour} size="lg" />
            <span>
              <b>{me.name}</b>
              <span>{me.sub}</span>
            </span>
          </div>
          {groups
            .filter((g) => g.length > 0)
            .map((g, i) => (
              <div key={i} className="am-group">
                {g.map((it) => (
                  <Link
                    key={it.href}
                    href={it.href}
                    role="menuitem"
                    className="am-item"
                    onClick={() => setOpen(false)}
                  >
                    <Icon name={it.icon} width={18} height={18} />
                    <span>{it.label}</span>
                  </Link>
                ))}
              </div>
            ))}
          <form action={signOut} className="am-group">
            <button type="submit" role="menuitem" className="am-item am-out">
              <Icon name="logout" width={18} height={18} />
              <span>{signOutLabel}</span>
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
