'use client';

import { useSyncExternalStore } from 'react';

/** Remembered per browser: which of the nav's service groups are folded away. */
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
 * Whether one of the nav's service groups is open, and its fold. Open until
 * someone folds it; that choice is kept in this browser (the server renders
 * every group open).
 */
export function useFold(id: string): [boolean, () => void] {
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
  return [open, toggle];
}
