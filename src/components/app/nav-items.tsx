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
 * menu when it's split into lists (the account area's), so only one is ever marked.
 */
export function NavItems({
  items,
  among,
  iconSize = 21,
}: {
  items: NavItem[];
  among?: NavItem[];
  iconSize?: number;
}) {
  const pathname = usePathname();
  const active = activeItem(among ?? items, pathname);
  return (
    <div className="nav-items">
      {items.map((it) => (
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
      ))}
    </div>
  );
}

/** The current section's name (under the household name on a phone). */
export function SectionName({ items, fallback }: { items: NavItem[]; fallback: string }) {
  const pathname = usePathname();
  return <>{activeItem(items, pathname)?.label ?? fallback}</>;
}
