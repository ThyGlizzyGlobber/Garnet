'use client';

import Link from 'next/link';
import { useSyncExternalStore, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './icons';

/** The top bar's back slot (see AppShell), once the page is in the browser. */
const slot = () => document.getElementById('tb-back');
const subscribe = () => () => {};

/**
 * A page's way back, drawn as a round arrow in the top bar's left corner
 * (where search used to be), in the same style as the bar's other round
 * buttons. The page says where back goes; the arrow is placed into the top
 * bar's slot once the page is in the browser. `children` is the accessible
 * name ("Services").
 */
export function TopBack({ href, children }: { href: string; children: ReactNode }) {
  const target = useSyncExternalStore(subscribe, slot, () => null);
  if (!target) return null;
  return createPortal(
    <Link href={href} className="ibtn tb-back-btn">
      <Icon name="arrow-left" width={20} height={20} />
      <span className="sr-only">{children}</span>
    </Link>,
    target,
  );
}
