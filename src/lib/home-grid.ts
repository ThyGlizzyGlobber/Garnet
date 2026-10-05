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

/**
 * When the menu is the stack of cards on the frame (src/styles/shell.css): a
 * desktop, or any landscape screen 900 px wide or more. Edit Home then uses
 * the frame (its bar on the top line, Add a widget in the menu's place).
 */
export const STACK_MEDIA = '(min-width: 1200px), (min-width: 900px) and (orientation: landscape)';

/**
 * Home's grid on the stack (a desktop, or an iPad on its side) follows the
 * room it has (owner, 2026-10-05). Blocks stay square; the density is a
 * block size (large, medium or small), so the rows are as many blocks of
 * that size as the height fits, a block's side is then what the height
 * allows for those rows, and the columns are as many as the width fits,
 * rounded to the nearest (half a column or more to spare adds one, the
 * blocks narrowing to fit). Two to six rows, three to ten columns. A bigger
 * window shows more widgets at the same size, a smaller one fewer.
 */
const STACK_BLOCK: Record<Density, number> = { comfy: 260, standard: 200, dense: 150 };
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
export function stackGrid(
  density: Density,
  width: number,
  height: number,
  gap: number,
): [number, number] {
  const rows = clamp(Math.round((height + gap) / (STACK_BLOCK[density] + gap)), 2, 6);
  const side = (height - (rows - 1) * gap) / rows;
  const cols = side > 0 ? clamp(Math.round((width + gap) / (side + gap)), 3, 10) : 4;
  return [cols, rows];
}

/**
 * A layout's widgets flowed onto pages of a grid, in their order, each page
 * filled before the next: how a stack's Home follows its column count.
 */
export function flow(pages: Pages, cols: number, rows: number): Pages {
  return normalise([pages.flat()], cols, rows);
}

/** Which kind of screen a viewport is, for its grid: a desktop from 1200 px, an iPad either way to 640, a phone below. */
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

/**
 * A layout brought up to date: "Shares settled" is part of Settle up now (it
 * becomes Settle up, or goes when Settle up is already there), and every
 * widget takes the nearest of the three sizes.
 */
function upgrade(pages: Pages): Pages {
  const hasOwes = pages.some((pg) => pg.some((it) => it.id === 'owes'));
  let renamed = false;
  const merged = pages.map((pg) =>
    pg.flatMap((it) => {
      if (it.id !== 'settled') return [it];
      if (hasOwes || renamed) return [];
      renamed = true;
      return [{ ...it, id: 'owes' }];
    }),
  );
  return convertPages(merged);
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

/* ---------- defaults: a Home that is right from the first visit ---------- */

/**
 * The starting layouts (owner, 2026-10-04: "a default widget grid that is
 * great from the outset"). Each page fills its grid exactly, with no holes:
 * page one is what a person opens the app for (the month, what's due next,
 * money between housemates, the Inbox, the week, adding a bill), page two is
 * for looking further (due dates, activity, the months ahead). Sizes are S
 * 1×1, M 2×1 and L 2×2.
 *
 * An entry names its widget, or a few separated by "|": the first one the
 * household can show and hasn't placed yet is used (Settle up only when bills
 * are split, the weather only with a postcode), so a household that doesn't
 * split bills still gets full pages. "svc" is one of the household's own
 * services (its first without a widget), which always has something to say.
 */
type Def = [string, 'S' | 'M' | 'L'][][];
const DIMS = { S: [1, 1], M: [2, 1], L: [2, 2] } as const;

/**
 * Four across, three down (desktop and iPad landscape, SCOPE-shell.md §3e):
 * on the frame beside the menu, four square blocks by three fill the page
 * exactly. Household widgets only: every service is in the menu beside it.
 */
const WIDE: Def = [
  [
    ['month', 'L'],
    ['nextdue', 'M'],
    ['weather|postcode', 'M'],
    ['week', 'M'],
    ['owes|trend', 'S'],
    ['inbox', 'S'],
  ],
  [
    ['calendar', 'L'],
    ['activity', 'L'],
    ['trend|usage', 'M'],
    ['forecast', 'S'],
    ['actions', 'S'],
  ],
  [
    ['services', 'L'],
    ['usage|notices', 'M'],
    ['setaside|mine', 'M'],
    ['season|plan|notices', 'M'],
    ['plan|notices|mine', 'M'],
  ],
];

const HOME_DEFAULTS: Record<Device, Def> = {
  desktop: WIDE,
  tabletL: WIDE,
  // Three across, four down.
  tabletP: [
    [
      ['month', 'L'],
      ['weather|postcode', 'S'],
      ['inbox', 'S'],
      ['nextdue', 'M'],
      ['actions', 'S'],
      ['owes|trend', 'M'],
      ['forecast', 'S'],
    ],
    [
      ['calendar', 'L'],
      ['setaside|mine', 'S'],
      ['svc|season|plan', 'S'],
      ['week', 'M'],
      ['services', 'S'],
      ['activity', 'M'],
      ['usage|notices', 'S'],
    ],
  ],
  // Two across, four down.
  phone: [
    [
      ['month', 'L'],
      ['nextdue', 'M'],
      ['weather|postcode', 'S'],
      ['inbox', 'S'],
    ],
    [
      ['week', 'M'],
      ['owes|trend', 'M'],
      ['services', 'L'],
    ],
    [
      ['calendar', 'L'],
      ['activity', 'L'],
    ],
  ],
};

const HOME_DENSITY: Record<Device, Density> = {
  desktop: 'comfy',
  tabletL: 'comfy',
  tabletP: 'comfy',
  phone: 'standard',
};

/** A brand-new household: Get started, and the widgets that fill in as bills arrive. */
const WIDE_FRESH: Def = [
  [
    ['start', 'L'],
    ['weather|postcode', 'M'],
    ['actions', 'S'],
    ['inbox', 'S'],
    ['week', 'M'],
    ['month', 'M'],
  ],
];
const FRESH_DEFAULTS: Record<Device, Def> = {
  desktop: WIDE_FRESH,
  tabletL: WIDE_FRESH,
  tabletP: [
    [
      ['start', 'L'],
      ['weather|postcode', 'S'],
      ['actions', 'S'],
      ['week', 'M'],
      ['inbox', 'S'],
      ['month', 'M'],
      ['nextdue', 'S'],
    ],
  ],
  phone: [
    [
      ['start', 'L'],
      ['weather|postcode', 'S'],
      ['actions', 'S'],
      ['week', 'M'],
    ],
    [
      ['month', 'M'],
      ['nextdue', 'M'],
    ],
  ],
};

/** The wall: four across, two down, read from across a room. */
const WALL_DEFAULT: Def = [
  [
    ['month', 'L'],
    ['week', 'M'],
    ['nextdue', 'S'],
    ['weather|inbox', 'S'],
  ],
];

/** Widgets only a household that splits its bills has. */
const SPLIT_ONLY = new Set(['owes', 'setaside']);

export interface HouseholdFacts {
  split: boolean;
  postcode: boolean;
  /** No bills yet. */
  fresh: boolean;
  /** The household's services, in its order: a default layout may give one its own widget. */
  services?: string[];
}

/** Whether a household has anything for a widget to show at all. */
const shows = (id: string, facts: HouseholdFacts): boolean => {
  if (!facts.split && SPLIT_ONLY.has(id)) return false;
  if (id === 'weather') return facts.postcode;
  if (id === 'postcode') return !facts.postcode;
  return true;
};

/** Whether a household can add a widget to its Home (Get started is only ever placed for it). */
export function available(id: string, facts: HouseholdFacts): boolean {
  return shows(id, facts) && id !== 'start';
}

/** The default layout for a screen and household: every entry's first widget it can show, none twice. */
export function defaultLayout(device: Device, kind: LayoutKind, facts: HouseholdFacts): Layout {
  const def =
    kind === 'wall' ? WALL_DEFAULT : facts.fresh ? FRESH_DEFAULTS[device] : HOME_DEFAULTS[device];
  const seen = new Set<string>();
  const pages: Pages = def.map((pg) =>
    pg.flatMap(([ids, size]) => {
      const id = ids
        .split('|')
        // "svc" stands for the household's next service that has no widget yet.
        .map((x) =>
          x === 'svc' ? (facts.services ?? []).map((s) => `svc-${s}`).find((w) => !seen.has(w)) : x,
        )
        .find((x): x is string => !!x && shows(x, facts) && !seen.has(x));
      if (!id) return [];
      seen.add(id);
      const [w, h] = DIMS[size];
      return [{ id, w, h }];
    }),
  );
  return { density: kind === 'wall' ? 'standard' : HOME_DENSITY[device], pages: upgrade(pages) };
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
  return { density: density as Density, pages: upgrade(out) };
}

/** The screens whose Home moved to four by three (SCOPE-shell.md §8 Q9). */
const FOUR_BY_THREE: Device[] = ['desktop', 'tabletL'];

/**
 * A saved Home layout moved onto four by three: the same widgets, sizes and
 * order, packed onto pages of four by three; those that no longer fit on a
 * page move to the next. Other screens, and the wall, are left as they are.
 */
export function toFourByThree(device: Device, kind: LayoutKind, layout: Layout): Layout {
  if (kind !== 'home' || !FOUR_BY_THREE.includes(device)) return layout;
  const [cols, rows] = GRIDS[device].comfy;
  return { density: 'comfy', pages: normalise(layout.pages, cols, rows) };
}
