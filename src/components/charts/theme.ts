'use client';

import { useSyncExternalStore } from 'react';
import { darkVariant } from '@/lib/palette';

/** Tracks prefers-color-scheme so chart marks use the palette's dark steps. */
const query = '(prefers-color-scheme: dark)';
function subscribe(cb: () => void) {
  const mq = window.matchMedia(query);
  mq.addEventListener('change', cb);
  const obs = new MutationObserver(cb);
  obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  return () => {
    mq.removeEventListener('change', cb);
    obs.disconnect();
  };
}
function isDark(): boolean {
  const forced = document.documentElement.dataset.theme;
  if (forced === 'dark') return true;
  if (forced === 'light') return false;
  return window.matchMedia(query).matches;
}
/** Tracks the effective theme: Settings override first, then the device setting. */
export function useDarkMode(): boolean {
  return useSyncExternalStore(subscribe, isDark, () => false);
}

export function seriesColour(light: string, dark: boolean): string {
  return dark ? darkVariant(light) : light;
}

export const chartInk = {
  grid: 'var(--color-border)',
  axis: 'var(--color-fg-muted)',
  tooltipBg: 'var(--color-surface-solid)',
  tooltipBorder: 'var(--color-border)',
};
