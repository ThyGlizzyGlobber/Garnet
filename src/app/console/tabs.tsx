'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cx } from '@/components/ui/cx';

/** The console's sections as a row of pills; the current one is marked. */
export function ConsoleTabs({ tabs }: { tabs: { href: string; label: string }[] }) {
  const pathname = usePathname();
  return (
    <nav className="con-tabs" aria-label="Console">
      {tabs.map((t) => {
        const on = t.href === '/console' ? pathname === '/console' : pathname.startsWith(t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            className={cx('con-tab', on && 'on')}
            aria-current={on ? 'page' : undefined}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
