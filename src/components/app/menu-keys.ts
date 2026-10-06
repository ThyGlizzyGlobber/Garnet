import type { KeyboardEvent } from 'react';

/**
 * Arrow keys through a dropdown's links and buttons (SCOPE-header.md §3b):
 * down and up move, Home and End jump, wrapping at the ends. Call it from the
 * dropdown's onKeyDown; Escape is the opener's to handle.
 */
export function menuKeys(e: KeyboardEvent<HTMLElement>): void {
  const keys = ['ArrowDown', 'ArrowUp', 'Home', 'End'];
  if (!keys.includes(e.key)) return;
  const items = Array.from(
    e.currentTarget.querySelectorAll<HTMLElement>('a[href], button:not([disabled])'),
  ).filter((el) => el.offsetParent !== null);
  if (!items.length) return;
  e.preventDefault();
  const at = items.indexOf(document.activeElement as HTMLElement);
  const next =
    e.key === 'Home'
      ? 0
      : e.key === 'End'
        ? items.length - 1
        : e.key === 'ArrowDown'
          ? (at + 1) % items.length
          : at <= 0
            ? items.length - 1
            : at - 1;
  items[next]!.focus();
}

/** Focuses a dropdown's first link or button once it has opened. */
export function focusFirst(root: HTMLElement | null | undefined): void {
  root?.querySelector<HTMLElement>('a[href], button:not([disabled])')?.focus();
}
