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

/**
 * Service colours beyond the palette (services only; members keep the
 * palette): a base colour for each main service that has none of its own
 * (slate for Vehicles, brown for Home & property, lime for Lifestyle, plum
 * for Subscriptions, grey for Other) and eight shades of each main
 * service's colour ("slate-1" darkest … "slate-8" lightest; the base is the
 * fourth), worn by the parts inside it: Rego, Insurance… under Vehicles.
 */
const SERVICE_COLOURS: { name: string; light: string; dark: string }[] = [
  { name: 'slate-1', light: '#3b485a', dark: '#5c6878' },
  { name: 'slate-2', light: '#49596e', dark: '#728093' },
  { name: 'slate-3', light: '#54667f', dark: '#8393a9' },
  { name: 'slate', light: '#5b6f8a', dark: '#8ea0b8' },
  { name: 'slate-5', light: '#79899f', dark: '#a2b1c5' },
  { name: 'slate-6', light: '#919fb1', dark: '#b3bfcf' },
  { name: 'slate-7', light: '#a8b3c1', dark: '#c3cdd9' },
  { name: 'slate-8', light: '#bdc5d0', dark: '#d2d9e3' },
  { name: 'brown-1', light: '#644526', dark: '#7f5e3e' },
  { name: 'brown-2', light: '#7b552e', dark: '#9c744c' },
  { name: 'brown-3', light: '#8e6235', dark: '#b38557' },
  { name: 'brown', light: '#9a6a3a', dark: '#c3915f' },
  { name: 'brown-5', light: '#ac855d', dark: '#cea57c' },
  { name: 'brown-6', light: '#bb9b7b', dark: '#d7b594' },
  { name: 'brown-7', light: '#c9b097', dark: '#dfc5aa' },
  { name: 'brown-8', light: '#d7c3b0', dark: '#e7d3bf' },
  // A ninth for Home & property, which has more parts than eight: greyed, for "Something else".
  { name: 'brown-9', light: '#8f8276', dark: '#b3a699' },
  { name: 'lime-1', light: '#4f670c', dark: '#677f26' },
  { name: 'lime-2', light: '#627f0e', dark: '#7f9d2e' },
  { name: 'lime-3', light: '#709211', dark: '#92b435' },
  { name: 'lime', light: '#7a9f12', dark: '#9fc43a' },
  { name: 'lime-5', light: '#92b03d', dark: '#b0cf5d' },
  { name: 'lime-6', light: '#a6bf60', dark: '#bfd77b' },
  { name: 'lime-7', light: '#b9cc81', dark: '#cce097' },
  { name: 'lime-8', light: '#cad9a0', dark: '#d9e7b0' },
  { name: 'plum-1', light: '#65285d', dark: '#7f4577' },
  { name: 'plum-2', light: '#7d3172', dark: '#9d5592' },
  { name: 'plum-3', light: '#903884', dark: '#b462a8' },
  { name: 'plum', light: '#9c3d8f', dark: '#c46ab7' },
  { name: 'plum-5', light: '#ae60a3', dark: '#cf85c4' },
  { name: 'plum-6', light: '#bd7db4', dark: '#d79bcf' },
  { name: 'plum-7', light: '#cb98c4', dark: '#e0b0d9' },
  { name: 'plum-8', light: '#d7b1d2', dark: '#e7c3e2' },
  { name: 'grey', light: '#7c828c', dark: '#a3a9b2' },
  { name: 'red-1', light: '#942f2f', dark: '#964343' },
  { name: 'red-2', light: '#b63a3a', dark: '#b85252' },
  { name: 'red-3', light: '#d14342', dark: '#d45f5f' },
  { name: 'red-5', light: '#e86a69', dark: '#ea8282' },
  { name: 'red-6', light: '#ec8584', dark: '#ee9999' },
  { name: 'red-7', light: '#f09f9e', dark: '#f2aeae' },
  { name: 'red-8', light: '#f4b6b6', dark: '#f5c2c2' },
];

/**
 * The shades of a colour's family, darkest first, the base fourth ("red" is
 * the palette's): eight, and a greyed ninth where a main service needs one.
 */
export function shadesOf(base: string): string[] {
  // A shade's family is its name without the step ("lime-6" → "lime").
  const name = [...PALETTE, ...SERVICE_COLOURS]
    .find((p) => p.light.toLowerCase() === base.toLowerCase())
    ?.name.replace(/-\d$/, '');
  if (!name) return [];
  const all = [...PALETTE, ...SERVICE_COLOURS];
  return [1, 2, 3, 4, 5, 6, 7, 8, 9]
    .map((k) => all.find((p) => p.name === (k === 4 ? name : `${name}-${k}`))?.light)
    .filter((c): c is string => !!c);
}

const byLight = new Map([...PALETTE, ...SERVICE_COLOURS].map((p) => [p.light.toLowerCase(), p]));

/**
 * A stored colour as a CSS value that follows the light/dark theme: a palette
 * or service colour becomes its token (--sc-blue, --sc-slate-2 …, both steps
 * in globals.css); a colour
 * someone picked themselves stays as it is. Use this for every service or
 * member colour drawn on screen.
 */
export function colourCss(light: string): string {
  const p = byLight.get(light.toLowerCase());
  return p ? `var(--sc-${p.name})` : light;
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
