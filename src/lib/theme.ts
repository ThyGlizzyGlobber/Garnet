import { cookies } from 'next/headers';

export const THEMES = ['auto', 'light', 'dark'] as const;
export type Theme = (typeof THEMES)[number];
export const THEME_COOKIE = 'hud_theme';

/** The theme this browser chose in Settings; 'auto' follows the device. */
export async function getTheme(): Promise<Theme> {
  const v = (await cookies()).get(THEME_COOKIE)?.value;
  return (THEMES as readonly string[]).includes(v ?? '') ? (v as Theme) : 'auto';
}
