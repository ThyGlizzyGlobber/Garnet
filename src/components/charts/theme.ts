'use client';

import { useSyncExternalStore } from 'react';
import { darkVariant } from '@/lib/palette';

/** Tracks prefers-color-scheme so chart marks use the palette's dark steps. */
const query = '(prefers-color-scheme: dark)';
function subscribe(cb: () => void) {
  const mq = window.matchMedia(query);
  mq.addEventListener('change', cb);
  return () => mq.removeEventListener('change', cb);
}
export function useDarkMode(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false,
  );
}

export function seriesColour(light: string, dark: boolean): string {
  return dark ? darkVariant(light) : light;
}

export const chartInk = {
  grid: 'var(--color-border)',
  axis: 'var(--color-fg-muted)',
  tooltipBg: 'var(--color-surface)',
  tooltipBorder: 'var(--color-border)',
};
