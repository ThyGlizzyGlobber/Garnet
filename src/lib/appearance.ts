import type { Viewport } from 'next';
import { THEMES } from '@/db/schema';

/**
 * How the app looks for a person: light, dark or automatic. Saved on the
 * account so it follows them to every device and every household; a cookie
 * remembers the last choice in a browser for the pages before sign-in. The
 * glass is always glass: there is no setting for it, and the device's Reduce
 * transparency setting is not followed (owner, 2026-10-03).
 *
 * There is one colour scheme, Garnet (BRAND.md §2; owner, 2026-10-02): neutral
 * grey, Graphite buttons, Pyrope red for the brand and warnings. Its tokens
 * live in globals.css keyed on data-palette.
 */
export const SCHEME = 'garnet';
export type Theme = (typeof THEMES)[number];
export interface Appearance {
  theme: Theme;
}

/** Everyone starts following the device's light or dark. */
export const DEFAULT_APPEARANCE: Appearance = { theme: 'auto' };

export const isTheme = (v: unknown): v is Theme => (THEMES as readonly unknown[]).includes(v);

/**
 * The scheme's page colour (its --p-bg in globals.css), for the browser's
 * theme-color. tests/appearance.test.ts keeps it in step with the CSS.
 */
export const SCHEME_BG = { light: '#f5f5f5', dark: '#1c1c1c' };

/**
 * The cookie's form, e.g. "dark". Older cookies read "dark.clear" or
 * "ruby.dark.clear" (a preset before, a glass choice after); the theme is the
 * first part that reads as one and the rest is ignored. Anything unreadable
 * falls back to the default.
 */
export function parseAppearance(raw: string | null | undefined): Appearance {
  const theme = (raw ?? '').split('.').find(isTheme);
  return { theme: theme ?? DEFAULT_APPEARANCE.theme };
}

export const formatAppearance = (a: Appearance): string => a.theme;

/** The browser's own chrome takes the scheme's page colour; both, by device setting, when automatic. */
export function themeColor(a: Pick<Appearance, 'theme'>): NonNullable<Viewport['themeColor']> {
  if (a.theme !== 'auto') return SCHEME_BG[a.theme];
  return [
    { media: '(prefers-color-scheme: light)', color: SCHEME_BG.light },
    { media: '(prefers-color-scheme: dark)', color: SCHEME_BG.dark },
  ];
}
