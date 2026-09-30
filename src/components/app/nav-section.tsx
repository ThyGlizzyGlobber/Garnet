'use client';

import { useSyncExternalStore, type ReactNode } from 'react';
import { Icon } from './icons';

/** Remembered per browser: which of the nav's service sections are folded away. */
const key = (id: string) => `hud-nav-${id}`;
const listeners = new Set<() => void>();
/** This page's choices, for when the browser won't store them (private browsing). */
const memory = new Map<string, boolean>();
function subscribe(cb: () => void) {
  listeners.add(cb);
  window.addEventListener('storage', cb);
  return () => {
    listeners.delete(cb);
    window.removeEventListener('storage', cb);
  };
}
function isOpen(id: string): boolean {
  if (memory.has(id)) return memory.get(id)!;
  try {
    return localStorage.getItem(key(id)) !== 'closed';
  } catch {
    return true;
  }
}

/**
 * One of the nav's service sections (Essentials, Everything else, Just
 * yours): its heading folds the section away or opens it again. Open until
 * someone folds it; that choice is kept in this browser.
 */
export function NavSection({
  id,
  title,
  aside,
  showLabel,
  hideLabel,
  children,
}: {
  id: string;
  title: string;
  /** Beside the heading ("this month"). */
  aside?: string;
  showLabel: string;
  hideLabel: string;
  children: ReactNode;
}) {
  const open = useSyncExternalStore(
    subscribe,
    () => isOpen(id),
    () => true,
  );
  const toggle = () => {
    memory.set(id, !open);
    try {
      localStorage.setItem(key(id), open ? 'closed' : 'open');
    } catch {
      // Private browsing: it still folds for now.
    }
    for (const l of listeners) l();
  };
  return (
    <div className="nav-sec-g" data-open={open ? '' : undefined}>
      <button
        type="button"
        className="nav-sec nav-sec-t"
        aria-expanded={open}
        aria-label={`${open ? hideLabel : showLabel} · ${title}`}
        onClick={toggle}
      >
        <Icon name="chevron-down" width={13} height={13} className="nav-sec-chev" />
        <b>{title}</b>
        {aside && open && <span>{aside}</span>}
      </button>
      {open && children}
    </div>
  );
}
