import type { Viewport } from 'next';
import { APPEARANCE_PRESETS, GLASS_MODES, THEMES } from '@/db/schema';

/**
 * Each person's colours: one of five presets, in light, dark or automatic,
 * and the glass clear, solid or automatic (following the device's Reduce
 * transparency setting).
 * Saved on the member so it follows them to every device; a cookie remembers
 * the last choice in a browser for the pages before sign-in. The tokens
 * themselves live in globals.css, keyed on data-palette / data-theme.
 */
export type Preset = (typeof APPEARANCE_PRESETS)[number];
export type Theme = (typeof THEMES)[number];
export type Glass = (typeof GLASS_MODES)[number];
export interface Appearance {
  preset: Preset;
  theme: Theme;
  glass: Glass;
}

/** Everyone starts on Harbour, following the device's light or dark and its transparency setting. */
export const DEFAULT_APPEARANCE: Appearance = { preset: 'harbour', theme: 'auto', glass: 'auto' };

export const isPreset = (v: unknown): v is Preset =>
  (APPEARANCE_PRESETS as readonly unknown[]).includes(v);
export const isTheme = (v: unknown): v is Theme => (THEMES as readonly unknown[]).includes(v);
export const isGlass = (v: unknown): v is Glass => (GLASS_MODES as readonly unknown[]).includes(v);

/**
 * Each preset's page colour (its --p-bg in globals.css), for the browser's
 * theme-color. tests/appearance.test.ts keeps these in step with the CSS.
 */
export const PRESET_BG: Record<Preset, { light: string; dark: string }> = {
  mist: { light: '#e9e4dc', dark: '#12151b' },
  harbour: { light: '#e3e8ec', dark: '#0d141c' },
  ruby: { light: '#f0e4e3', dark: '#170c0e' },
  cobalt: { light: '#e4e9f3', dark: '#080d1a' },
  violet: { light: '#ebe5f3', dark: '#0f0a1a' },
};

/** The cookie's form, e.g. "ruby.dark.clear" (older cookies have no glass). Anything unreadable falls back to the default. */
export function parseAppearance(raw: string | null | undefined): Appearance {
  const [preset, theme, glass] = (raw ?? '').split('.');
  return {
    preset: isPreset(preset) ? preset : DEFAULT_APPEARANCE.preset,
    theme: isTheme(theme) ? theme : DEFAULT_APPEARANCE.theme,
    glass: isGlass(glass) ? glass : DEFAULT_APPEARANCE.glass,
  };
}

export const formatAppearance = (a: Appearance): string => `${a.preset}.${a.theme}.${a.glass}`;

/** The browser's own chrome takes the preset's page colour; both, by device setting, when automatic. */
export function themeColor(
  a: Pick<Appearance, 'preset' | 'theme'>,
): NonNullable<Viewport['themeColor']> {
  const bg = PRESET_BG[a.preset];
  if (a.theme !== 'auto') return bg[a.theme];
  return [
    { media: '(prefers-color-scheme: light)', color: bg.light },
    { media: '(prefers-color-scheme: dark)', color: bg.dark },
  ];
}
