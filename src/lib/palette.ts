/**
 * Validated categorical palette (light surface hex → dark surface hex), in fixed
 * order. Services store the light hex; charts and swatches look up the dark step.
 * Validated with the dataviz palette checker for CVD separation and contrast.
 */
export const PALETTE: { name: string; light: string; dark: string }[] = [
  { name: 'blue', light: '#2a78d6', dark: '#3987e5' },
  { name: 'orange', light: '#eb6834', dark: '#d95926' },
  { name: 'aqua', light: '#1baf7a', dark: '#199e70' },
  { name: 'yellow', light: '#eda100', dark: '#c98500' },
  { name: 'magenta', light: '#e87ba4', dark: '#d55181' },
  { name: 'green', light: '#008300', dark: '#008300' },
  { name: 'violet', light: '#4a3aa7', dark: '#9085e9' },
  { name: 'red', light: '#e34948', dark: '#e66767' },
];

const darkByLight = new Map(PALETTE.map((p) => [p.light.toLowerCase(), p.dark]));

/** Dark-mode step for a stored colour; unknown (user-picked) colours pass through. */
export function darkVariant(light: string): string {
  return darkByLight.get(light.toLowerCase()) ?? light;
}

/**
 * A stored colour as a CSS value that follows the light/dark scheme. Use this
 * for every service or member colour drawn on screen.
 */
export function colourCss(light: string): string {
  return `light-dark(${light}, ${darkVariant(light)})`;
}

/**
 * A tile tinted with a service or member colour: the colour mixed into the
 * solid surface (a stronger top fading down) with a matching rim.
 */
export function tintStyle(light: string, strength: 'strong' | 'soft' = 'strong') {
  const c = colourCss(light);
  const [top, bottom, rim] = strength === 'strong' ? [30, 10, 45] : [22, 6, 40];
  return {
    background: `linear-gradient(160deg, color-mix(in srgb, ${c} ${top}%, var(--color-surface-solid)), color-mix(in srgb, ${c} ${bottom}%, var(--color-surface-solid)))`,
    borderColor: `color-mix(in srgb, ${c} ${rim}%, transparent)`,
  };
}

/** The first palette colour: the default for anything new before a colour is picked. */
export const DEFAULT_COLOUR = PALETTE[0]!.light;

/** Pick the first palette colour not already in use, cycling only when all eight are taken. */
export function nextPaletteColour(used: string[]): string {
  const taken = new Set(used.map((c) => c.toLowerCase()));
  return (
    PALETTE.find((p) => !taken.has(p.light))?.light ?? PALETTE[used.length % PALETTE.length]!.light
  );
}

/** Suggested colour for a built-in service type, so demos and seeds look consistent. */
export const TYPE_COLOUR: Record<string, string> = {
  internet: '#2a78d6',
  electricity: '#eda100',
  gas: '#eb6834',
  water: '#1baf7a',
  rent: '#4a3aa7',
  council_rates: '#008300',
  other: '#e87ba4',
};
