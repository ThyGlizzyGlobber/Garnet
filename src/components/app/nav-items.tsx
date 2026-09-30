'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Icon } from './icons';

export interface NavItem {
  href: string;
  label: string;
  icon: string;
  badge?: number;
}

/** Which nav item a path belongs to: Home only at "/", the others by prefix. */
function activeItem(items: NavItem[], pathname: string): NavItem | undefined {
  return items.find((it) => (it.href === '/' ? pathname === '/' : pathname.startsWith(it.href)));
}

/** The nav's links, the current section marked. */
export function NavItems({ items, iconSize = 21 }: { items: NavItem[]; iconSize?: number }) {
  const pathname = usePathname();
  const active = activeItem(items, pathname);
  return (
    <div className="nav-items">
      {items.map((it) => (
        <Link
          key={it.href}
          href={it.href}
          className="nav-i"
          aria-current={it === active ? 'page' : undefined}
          aria-label={it.label}
        >
          <Icon name={it.icon} width={iconSize} height={iconSize} />
          <span>{it.label}</span>
          {it.badge ? <i className="badge">{it.badge}</i> : null}
        </Link>
      ))}
    </div>
  );
}

/** The current section's name (under the household name on a phone). */
export function SectionName({ items, fallback }: { items: NavItem[]; fallback: string }) {
  const pathname = usePathname();
  return <>{activeItem(items, pathname)?.label ?? fallback}</>;
}
