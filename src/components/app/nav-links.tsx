'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Icon } from './icons';
import type { NavItem } from './shell';

export function NavLinks({ items, variant }: { items: NavItem[]; variant: 'top' | 'bottom' }) {
  const pathname = usePathname();
  return (
    <>
      {items.map((item) => {
        const active = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
        if (variant === 'top') {
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition ${
                active ? 'bg-surface-2 text-fg' : 'text-fg-muted hover:text-fg'
              }`}
            >
              {item.label}
            </Link>
          );
        }
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-medium ${
              active ? 'text-accent' : 'text-fg-muted'
            }`}
          >
            <Icon name={item.icon} />
            {item.label}
          </Link>
        );
      })}
    </>
  );
}
