/**
 * The Home grid engine (BRAND.md §9, SCOPE-redesign.md R4): a grid of blocks
 * that fits the screen, widgets in block sizes packed first-fit onto pages,
 * whatever doesn't fit flowing onto the next page. Pure functions, shared by
 * the page (defaults, saving) and the client (editing).
 */

/** The four kinds of screen a layout is kept for. */
export const DEVICES = ['desktop', 'tabletL', 'tabletP', 'phone'] as const;
export type Device = (typeof DEVICES)[number];

export const DENSITIES = ['comfy', 'standard', 'dense'] as const;
export type Density = (typeof DENSITIES)[number];

export const LAYOUT_KINDS = ['home', 'wall'] as const;
export type LayoutKind = (typeof LAYOUT_KINDS)[number];

/** A widget on the grid: which one, and how many blocks wide and high. */
export interface Item {
  id: string;
  w: number;
  h: number;
}
/** Pages of items, in order; packing decides where each lands. */
export type Pages = Item[][];

export interface Layout {
  density: Density;
  pages: Pages;
}

/** A packed item: its block and its page. */
export interface Placed extends Item {
  pw: number;
  ph: number;
  r: number;
  c: number;
}

/** Columns × rows per device and density. */
const GRIDS: Record<Device, Record<Density, [number, number]>> = {
  desktop: { comfy: [4, 3], standard: [5, 3], dense: [6, 4] },
  tabletP: { comfy: [3, 4], standard: [4, 5], dense: [4, 6] },
  tabletL: { comfy: [4, 3], standard: [5, 3], dense: [6, 4] },
  phone: { comfy: [2, 3], standard: [2, 4], dense: [2, 5] },
};

/** The wall (kiosk): fewer, bigger blocks. */
const WALL_GRID: Record<Device, [number, number]> = {
  desktop: [4, 2],
  tabletL: [4, 2],
  tabletP: [2, 3],
  phone: [2, 3],
};

/** Which kind of screen a viewport is: the column from 1200 px, the rail to 640, a phone below. */
export function deviceFor(width: number, height: number): Device {
  if (width >= 1200) return 'desktop';
  if (width >= 640) return height > width ? 'tabletP' : 'tabletL';
  return 'phone';
}

/**
 * The grid for a screen. A short window (under about 760 px tall) drops a
 * row and pages instead of squeezing.
 */
export function gridFor(
  device: Device,
  density: Density,
  kind: LayoutKind = 'home',
  short = false,
): [number, number] {
  const [cols, rows] = kind === 'wall' ? WALL_GRID[device] : GRIDS[device][density];
  return [cols, short && rows > 2 ? rows - 1 : rows];
}

function findSpot(occ: boolean[][], cols: number, rows: number, w: number, h: number) {
  for (let r = 0; r + h <= rows; r++)
    for (let c = 0; c + w <= cols; c++) {
      let ok = true;
      for (let y = r; y < r + h && ok; y++)
        for (let x = c; x < c + w && ok; x++) if (occ[y]![x]) ok = false;
      if (ok) return { r, c };
    }
  return null;
}

/** Place each page's widgets first-fit; whatever doesn't fit moves to the next page. */
export function pack(pages: Pages, cols: number, rows: number): Placed[][] {
  const out: Placed[][] = [];
  let carry: Item[] = [];
  for (let p = 0; p < pages.length || carry.length; p++) {
    if (p > 40) break;
    const items = carry.concat(pages[p] ?? []);
    carry = [];
    const occ = Array.from({ length: rows }, () => Array<boolean>(cols).fill(false));
    const placed: Placed[] = [];
    for (const it of items) {
      const w = Math.min(it.w, cols);
      const h = Math.min(it.h, rows);
      const s = findSpot(occ, cols, rows, w, h);
      if (!s) {
        carry.push(it);
        continue;
      }
      for (let y = s.r; y < s.r + h; y++) for (let x = s.c; x < s.c + w; x++) occ[y]![x] = true;
      placed.push({ ...it, pw: w, ph: h, r: s.r, c: s.c });
    }
    out.push(placed);
  }
  return out;
}

/** The stored pages brought in step with what packing shows (overflow moves on, empty pages go). */
export function normalise(pages: Pages, cols: number, rows: number): Pages {
  return pack(pages, cols, rows)
    .map((pg) => pg.map(({ id, w, h }) => ({ id, w, h })))
    .filter((pg) => pg.length > 0);
}

/** Where a widget is, by page and index. */
export function locate(pages: Pages, id: string): { p: number; i: number } | null {
  for (let p = 0; p < pages.length; p++) {
    const i = pages[p]!.findIndex((x) => x.id === id);
    if (i >= 0) return { p, i };
  }
  return null;
}

/**
 * The three sizes every widget comes in (SCOPE-widgets.md §3a): Small is one
 * block, Medium two wide, Large two by two.
 */
const WIDGET_SIZES = { small: [1, 1], medium: [2, 1], large: [2, 2] } as const;
export type WidgetSize = keyof typeof WIDGET_SIZES;
export const SIZE_LIST: [number, number][] = [
  [...WIDGET_SIZES.small],
  [...WIDGET_SIZES.medium],
  [...WIDGET_SIZES.large],
];

/**
 * Which of the three a block size is nearest (SCOPE-widgets.md §8, Q2): one
 * block stays Small, anything one block high and wider is Medium, anything
 * two or more blocks high is Large.
 */
export function sizeName(w: number, h: number): WidgetSize {
  if (h >= 2) return 'large';
  return w >= 2 ? 'medium' : 'small';
}

/** A layout saved with the older sizes, each widget brought to the nearest of the three. */
export function convertPages(pages: Pages, converts: (id: string) => boolean = () => true): Pages {
  return pages.map((pg) =>
    pg.map((it) => {
      if (!converts(it.id)) return it;
      const [w, h] = WIDGET_SIZES[sizeName(it.w, it.h)];
      return { id: it.id, w, h };
    }),
  );
}

/** The sizes a widget can take on this grid. */
export function sizesOn(sizes: [number, number][], cols: number, rows: number): [number, number][] {
  return sizes.filter(([w, h]) => w <= cols && h <= rows);
}

/** The next size along for a widget (round again at the end). */
export function nextSize(
  item: Item,
  sizes: [number, number][],
  cols: number,
  rows: number,
): [number, number] {
  const on = sizesOn(sizes, cols, rows);
  if (on.length === 0) return [item.w, item.h];
  const cur = on.findIndex(
    ([w, h]) => w === Math.min(item.w, cols) && h === Math.min(item.h, rows),
  );
  return on[(cur + 1) % on.length]!;
}

/**
 * Move a widget to where it was dropped: onto another widget (it takes that
 * one's place in the order) or onto an empty block (it slots in before the
 * widgets that come after that block). Returns new pages.
 */
export function moveItem(
  pages: Pages,
  packed: Placed[][],
  id: string,
  cell: { page: number; r: number; c: number },
  cols: number,
  rows: number,
): Pages {
  const from = locate(pages, id);
  if (!from) return pages;
  const next = pages.map((pg) => pg.slice());
  while (next.length <= cell.page) next.push([]);
  const on = (packed[cell.page] ?? []).find(
    (it) => cell.c >= it.c && cell.c < it.c + it.pw && cell.r >= it.r && cell.r < it.r + it.ph,
  );
  if (on && on.id === id) return pages;
  const item = next[from.p]![from.i]!;
  next[from.p]!.splice(from.i, 1);
  if (on) {
    const to = locate(next, on.id)!;
    const after = from.p === to.p && from.i < to.i;
    next[to.p]!.splice(to.i + (after ? 1 : 0), 0, item);
  } else {
    const idx = cell.r * cols + cell.c;
    const before = (packed[cell.page] ?? []).filter(
      (it) => it.id !== id && it.r * cols + it.c < idx,
    ).length;
    const list = next[cell.page]!;
    list.splice(Math.min(before, list.length), 0, item);
  }
  return normalise(next, cols, rows);
}

/* ---------- defaults: the studio's calmer Home (Almanac 2, homeRev 2) ---------- */

type Def = [string, number, number][][];

const HOME_DEFAULTS: Record<Device, Def> = {
  desktop: [
    [
      ['month', 2, 2],
      ['week', 3, 1],
      ['nextdue', 2, 1],
      ['weather', 1, 1],
      ['owes', 2, 1],
      ['services', 3, 1],
    ],
    [
      ['calendar', 2, 2],
      ['activity', 3, 2],
      ['forecast', 3, 1],
      ['season', 2, 1],
    ],
  ],
  tabletL: [
    [
      ['month', 2, 2],
      ['week', 3, 1],
      ['nextdue', 2, 1],
      ['weather', 1, 1],
      ['owes', 2, 1],
      ['services', 3, 1],
    ],
    [
      ['calendar', 2, 2],
      ['activity', 3, 2],
      ['forecast', 3, 1],
      ['season', 2, 1],
    ],
  ],
  tabletP: [
    [
      ['month', 2, 2],
      ['weather', 1, 1],
      ['nextdue', 1, 1],
      ['week', 3, 1],
      ['owes', 2, 1],
      ['settled', 1, 1],
    ],
    [
      ['services', 3, 1],
      ['calendar', 2, 2],
      ['actions', 1, 1],
      ['season', 1, 1],
      ['activity', 3, 1],
    ],
  ],
  phone: [
    [
      ['month', 2, 2],
      ['week', 2, 1],
      ['nextdue', 2, 1],
    ],
    [
      ['owes', 2, 1],
      ['services', 2, 2],
      ['weather', 1, 1],
      ['actions', 1, 1],
    ],
    [
      ['calendar', 2, 2],
      ['activity', 2, 2],
    ],
  ],
};

const HOME_DENSITY: Record<Device, Density> = {
  desktop: 'standard',
  tabletL: 'standard',
  tabletP: 'comfy',
  phone: 'standard',
};

/** A brand-new household: Get started and the few widgets that already say something. */
const FRESH_DEFAULTS: Record<Device, Def> = {
  desktop: [
    [
      ['start', 3, 2],
      ['weather', 2, 1],
      ['week', 2, 1],
      ['month', 2, 1],
      ['nextdue', 3, 1],
    ],
  ],
  tabletL: [
    [
      ['start', 3, 2],
      ['weather', 2, 1],
      ['week', 2, 1],
      ['month', 2, 1],
      ['nextdue', 3, 1],
    ],
  ],
  tabletP: [
    [
      ['start', 3, 2],
      ['weather', 1, 1],
      ['week', 3, 1],
      ['month', 2, 1],
      ['nextdue', 1, 1],
    ],
  ],
  phone: [
    [
      ['start', 2, 2],
      ['weather', 2, 1],
      ['week', 2, 1],
    ],
    [
      ['month', 2, 1],
      ['nextdue', 2, 1],
    ],
  ],
};

const WALL_DEFAULT: Def = [
  [
    ['month', 2, 2],
    ['week', 2, 1],
    ['nextdue', 1, 1],
    ['weather', 1, 1],
  ],
];

/** What a household can show in place of a widget it can't (not splitting, no postcode). */
const SPLIT_ONLY: Record<string, string> = {
  owes: 'calendar',
  settled: 'plan',
  setaside: 'forecast',
};

export interface HouseholdFacts {
  split: boolean;
  postcode: boolean;
  /** No bills yet. */
  fresh: boolean;
}

export function swapFor(id: string, facts: HouseholdFacts): string {
  if (!facts.split && SPLIT_ONLY[id]) return SPLIT_ONLY[id];
  if (!facts.postcode && id === 'weather') return 'postcode';
  return id;
}

/** Whether a household can put a widget on its Home at all. */
export function available(id: string, facts: HouseholdFacts): boolean {
  if (!facts.split && SPLIT_ONLY[id]) return false;
  if (!facts.postcode && id === 'weather') return false;
  if (facts.postcode && id === 'postcode') return false;
  return id !== 'start';
}

/** The default layout for a screen and household, with swaps applied and no widget twice. */
export function defaultLayout(device: Device, kind: LayoutKind, facts: HouseholdFacts): Layout {
  const def =
    kind === 'wall' ? WALL_DEFAULT : facts.fresh ? FRESH_DEFAULTS[device] : HOME_DEFAULTS[device];
  const seen = new Set<string>();
  const pages: Pages = def.map((pg) =>
    pg
      .map(([id, w, h]) => ({ id: swapFor(id, facts), w, h }))
      .filter((it) => (seen.has(it.id) ? false : (seen.add(it.id), true))),
  );
  return { density: kind === 'wall' ? 'standard' : HOME_DENSITY[device], pages };
}

/** A stored layout checked before use: known shape, sane numbers, at most 40 pages. */
export function parseLayout(raw: unknown): Layout | null {
  if (!raw || typeof raw !== 'object') return null;
  const { density, pages } = raw as { density?: unknown; pages?: unknown };
  if (!(DENSITIES as readonly unknown[]).includes(density) || !Array.isArray(pages)) return null;
  const out: Pages = [];
  for (const pg of pages.slice(0, 40)) {
    if (!Array.isArray(pg)) return null;
    const items: Item[] = [];
    for (const it of pg) {
      const { id, w, h } = (it ?? {}) as Partial<Item>;
      if (typeof id !== 'string' || !/^[\w-]{1,60}$/.test(id)) return null;
      if (!Number.isInteger(w) || !Number.isInteger(h) || w! < 1 || h! < 1 || w! > 8 || h! > 8)
        return null;
      items.push({ id, w: w!, h: h! });
    }
    out.push(items);
  }
  return { density: density as Density, pages: out };
}
