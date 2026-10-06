'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { createContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { cx } from '@/components/ui/cx';
import { Icon } from './icons';
import { focusFirst, menuKeys } from './menu-keys';

/** Closes the dropdown a panel sits in (the panel's links call it). */
export const PanelClose = createContext<() => void>(() => {});

export interface NavItem {
  href: string;
  label: string;
  icon: string;
  badge?: number;
}

/**
 * Which nav item a path belongs to: Home only at "/", the others by prefix,
 * the longest winning (Overview at /account/overview, not Households at /account).
 */
function activeItem(items: NavItem[], pathname: string): NavItem | undefined {
  const fits = (href: string) =>
    href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`);
  return items.filter((it) => fits(it.href)).sort((a, b) => b.href.length - a.href.length)[0];
}

/**
 * The nav's links, the current section marked. `among` is every link in the
 * menu when it's split into lists, so only one is ever marked. `panels` gives
 * a link a dropdown in its place (the bar's Services pill, SCOPE-header.md
 * §3c): the pill opens it on a click and stays lit while it's open.
 */
export function NavItems({
  items,
  among,
  iconSize = 21,
  panels,
}: {
  items: NavItem[];
  among?: NavItem[];
  iconSize?: number;
  panels?: Record<string, ReactNode>;
}) {
  const pathname = usePathname();
  const active = activeItem(among ?? items, pathname);
  return (
    <div className="nav-items">
      {items.map((it) =>
        panels?.[it.href] ? (
          <NavPill
            key={it.href}
            item={it}
            current={it.href === active?.href}
            iconSize={iconSize}
            panel={panels[it.href]!}
          />
        ) : (
          <Link
            key={it.href}
            href={it.href}
            className="nav-i"
            aria-current={it.href === active?.href ? 'page' : undefined}
            aria-label={it.label}
          >
            <Icon name={it.icon} width={iconSize} height={iconSize} />
            <span>{it.label}</span>
            {it.badge ? <i className="badge">{it.badge}</i> : null}
          </Link>
        ),
      )}
    </div>
  );
}

/** A pill with a dropdown: a click opens it, Escape or a click elsewhere closes it. */
function NavPill({
  item,
  current,
  iconSize,
  panel,
}: {
  item: NavItem;
  current: boolean;
  iconSize: number;
  panel: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  // Moving to another page closes it.
  const [seen, setSeen] = useState(pathname);
  if (seen !== pathname) {
    setSeen(pathname);
    setOpen(false);
  }
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setOpen(false);
      box.current?.querySelector<HTMLButtonElement>('.nav-pill')?.focus();
    };
    document.addEventListener('click', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('click', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);
  return (
    <div ref={box} className="nav-dd" onKeyDown={(e) => open && menuKeys(e)}>
      <button
        type="button"
        className={cx('nav-i nav-pill')}
        aria-current={current ? 'page' : undefined}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          // Down opens it and lands on its first row.
          if (e.key !== 'ArrowDown') return;
          e.preventDefault();
          setOpen(true);
          setTimeout(() => focusFirst(box.current?.querySelector('.sp')), 0);
        }}
      >
        <Icon name={item.icon} width={iconSize} height={iconSize} />
        <span>{item.label}</span>
        <Icon name="chevron-down" width={13} height={13} className="nav-chev" />
      </button>
      {open && <PanelClose.Provider value={() => setOpen(false)}>{panel}</PanelClose.Provider>}
    </div>
  );
}

/** The current section's name (under the household name on a phone). */
export function SectionName({ items, fallback }: { items: NavItem[]; fallback: string }) {
  const pathname = usePathname();
  return <>{activeItem(items, pathname)?.label ?? fallback}</>;
}
