'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Icon } from './icons';
import type { NavItem } from './shell';

/** The floating segmented tab bar's links (the active one filled with the accent). */
export function NavLinks({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  return (
    <>
      {items.map((item) => {
        const active = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            className={`flex flex-1 items-center justify-center gap-2 rounded-full px-2 py-2.5 text-[11px] font-semibold transition sm:flex-none sm:px-5 sm:py-3 sm:text-[13px] ${
              active ? 'bg-accent text-accent-fg' : 'text-fg-muted hover:text-fg'
            }`}
          >
            <Icon name={item.icon} width={18} height={18} />
            <span className={active ? 'inline' : 'hidden sm:inline'}>{item.label}</span>
          </Link>
        );
      })}
    </>
  );
}
