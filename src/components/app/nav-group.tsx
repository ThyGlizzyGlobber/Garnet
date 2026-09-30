'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { Icon } from './icons';

/**
 * A main service in the nav with its sub-services under an arrow
 * (Subscriptions → Netflix, Spotify). The name opens the main service's page;
 * the arrow shows or hides the sub-services. Open while one of them, or the
 * main service, is the page being shown.
 */
export function NavGroup({
  href,
  childHrefs,
  label,
  colour,
  showLabel,
  hideLabel,
  row,
  children,
}: {
  href: string;
  childHrefs: string[];
  label: string;
  /** The main service's colour, as CSS. */
  colour: string;
  showLabel: string;
  hideLabel: string;
  /** The main service's own line: dot, name, figure. */
  row: ReactNode;
  children: ReactNode;
}) {
  const pathname = usePathname();
  // Open on the main service's page or a sub-service's (their links may carry ?open=).
  const here = pathname === href || childHrefs.some((h) => h.split(/[?#]/)[0] === pathname);
  const [open, setOpen] = useState<boolean | null>(null);
  const shown = open ?? here;
  return (
    <div className="nc-g" data-open={shown ? '' : undefined}>
      <div className="nc-g-h">
        <Link
          href={href}
          className="nc-s"
          style={{ ['--svc' as string]: colour }}
          aria-current={pathname === href ? 'page' : undefined}
        >
          {row}
        </Link>
        <button
          type="button"
          className="nc-g-t"
          aria-expanded={shown}
          aria-label={`${shown ? hideLabel : showLabel} · ${label}`}
          onClick={() => setOpen(!shown)}
        >
          <Icon name="chevron-down" width={15} height={15} />
        </button>
      </div>
      {shown && <div className="nc-g-c">{children}</div>}
    </div>
  );
}
