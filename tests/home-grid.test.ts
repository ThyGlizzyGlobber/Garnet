import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { openDb, type Db } from '@/db/client';
import { runMigrations } from '@/db/migrate';
import {
  available,
  convertPages,
  defaultLayout,
  deviceFor,
  gridFor,
  moveItem,
  nextSize,
  normalise,
  pack,
  toFourByThree,
  toOnePage,
  addItem,
  hidden,
  stackGrid,
  parseLayout,
  SIZE_LIST,
  sizeName,
} from '@/lib/home-grid';
import { layoutsFor, resetLayout, saveLayout } from '@/lib/home-layout';
import { createHousehold } from '@/lib/households';
import { createMember } from '@/lib/members';
import { unitInline } from '@/components/home/fmt';
import { weekFacts } from '@/lib/week-summary';

const facts = { split: true, postcode: true, fresh: false };

describe('the Home grid engine', () => {
  it('knows which screen a viewport is, and drops a row on a short window', () => {
    expect(deviceFor(1440, 900)).toBe('desktop');
    expect(deviceFor(1180, 820)).toBe('tabletL');
    expect(deviceFor(820, 1180)).toBe('tabletP');
    expect(deviceFor(393, 852)).toBe('phone');
    expect(gridFor('desktop', 'standard')).toEqual([5, 3]);
    expect(gridFor('desktop', 'standard', 'home', true)).toEqual([5, 2]);
    expect(gridFor('phone', 'dense')).toEqual([2, 5]);
    expect(gridFor('desktop', 'standard', 'wall')).toEqual([4, 2]);
  });

  it('packs widgets first-fit and moves what doesn’t fit onto the next page', () => {
    const pages = [
      [
        { id: 'a', w: 2, h: 2 },
        { id: 'b', w: 3, h: 1 },
        { id: 'c', w: 2, h: 1 },
        { id: 'd', w: 1, h: 1 },
        { id: 'e', w: 5, h: 1 },
      ],
    ];
    const packed = pack(pages, 5, 3);
    expect(packed[0]!.map((p) => [p.id, p.r, p.c])).toEqual([
      ['a', 0, 0],
      ['b', 0, 2],
      ['c', 1, 2],
      ['d', 1, 4],
      ['e', 2, 0],
    ]);
    // A widget wider than the grid is squeezed to fit; one that doesn't fit at all moves on.
    const wide = pack(
      [
        [
          { id: 'x', w: 8, h: 1 },
          { id: 'y', w: 5, h: 3 },
        ],
      ],
      5,
      3,
    );
    expect(wide[0]!.map((p) => p.id)).toEqual(['x']);
    expect(wide[0]![0]!.pw).toBe(5);
    expect(wide[1]!.map((p) => p.id)).toEqual(['y']);
    expect(normalise([[], [{ id: 'y', w: 1, h: 1 }], []])).toEqual([[{ id: 'y', w: 1, h: 1 }]]);
    // What doesn't fit the one page is hidden, not lost (E-D5).
    expect(hidden(wide).map((x) => x.id)).toEqual(['y']);
  });

  it('moves a widget onto another’s place, or onto an empty block', () => {
    const pages = [
      [
        { id: 'a', w: 1, h: 1 },
        { id: 'b', w: 1, h: 1 },
        { id: 'c', w: 1, h: 1 },
      ],
    ];
    const packed = pack(pages, 5, 3);
    // c dropped on a: it takes a's place in the order.
    expect(moveItem(pages, packed, 'c', { r: 0, c: 0 }, 5)[0]!.map((x) => x.id)).toEqual([
      'c',
      'a',
      'b',
    ]);
    // a dropped on an empty block after everything: it goes to the end.
    expect(moveItem(pages, packed, 'a', { r: 2, c: 4 }, 5)[0]!.map((x) => x.id)).toEqual([
      'b',
      'c',
      'a',
    ]);
    // Dropped on itself: nothing changes.
    expect(moveItem(pages, packed, 'a', { r: 0, c: 0 }, 5)).toBe(pages);
  });

  it('adds a widget at a block or the first free one, and refuses when Home is full', () => {
    const pages = [
      [
        { id: 'a', w: 1, h: 1 },
        { id: 'b', w: 1, h: 1 },
      ],
    ];
    // The plus: the first free block, at the end of the order.
    expect(addItem(pages, { id: 'x', w: 2, h: 1 }, null, 2, 2)![0]!.map((x) => x.id)).toEqual([
      'a',
      'b',
      'x',
    ]);
    // Dropped on a widget: it takes that widget's place in the order.
    expect(
      addItem(pages, { id: 'x', w: 1, h: 1 }, { r: 0, c: 0 }, 2, 2)![0]!.map((x) => x.id),
    ).toEqual(['x', 'a', 'b']);
    // Already in the layout: not twice.
    expect(addItem(pages, { id: 'a', w: 1, h: 1 }, null, 2, 2)).toBeNull();
    // No room for it, or it would push a shown widget off: refused (E-D5).
    expect(addItem(pages, { id: 'x', w: 2, h: 2 }, null, 2, 2)).toBeNull();
    const full = [[{ id: 'a', w: 2, h: 2 }]];
    expect(addItem(full, { id: 'x', w: 1, h: 1 }, { r: 0, c: 0 }, 2, 2)).toBeNull();
    // A saved layout with pages folds to one, in order.
    expect(toOnePage([[{ id: 'a', w: 1, h: 1 }], [], [{ id: 'b', w: 1, h: 1 }]])).toEqual([
      [
        { id: 'a', w: 1, h: 1 },
        { id: 'b', w: 1, h: 1 },
      ],
    ]);
  });

  it('cycles a widget’s size through the sizes that fit the grid', () => {
    const sizes: [number, number][] = [
      [1, 1],
      [2, 1],
      [2, 2],
      [3, 2],
    ];
    expect(nextSize({ id: 'x', w: 1, h: 1 }, sizes, 5, 3)).toEqual([2, 1]);
    expect(nextSize({ id: 'x', w: 3, h: 2 }, sizes, 5, 3)).toEqual([1, 1]);
    expect(nextSize({ id: 'x', w: 2, h: 2 }, sizes, 2, 4)).toEqual([1, 1]);
  });

  it('starts every household on one full page, whatever it can show', () => {
    const noSplit = { split: false, postcode: true, fresh: false };
    expect(available('owes', noSplit)).toBe(false);
    expect(available('postcode', facts)).toBe(false);
    expect(available('weather', { ...facts, postcode: false })).toBe(false);
    expect(available('start', facts)).toBe(false);
    const d = defaultLayout('desktop', 'home', facts);
    // Four by three on the frame (SCOPE-shell.md §3e), household widgets only.
    expect(d.density).toBe('comfy');
    expect(d.pages[0]!.map((x) => x.id)).toEqual([
      'month',
      'nextdue',
      'weather',
      'week',
      'owes',
      'inbox',
    ]);
    // Not splitting: Monthly cost takes Settle up's place, and no widget is there twice.
    const single = defaultLayout('desktop', 'home', noSplit);
    expect(single.pages[0]!.map((x) => x.id)).toContain('trend');
    expect(single.pages.flat().map((x) => x.id)).not.toContain('owes');
    // No postcode: the weather's place asks for one.
    expect(
      defaultLayout('phone', 'home', { ...facts, postcode: false }).pages[0]!.map((x) => x.id),
    ).toContain('postcode');
    expect(defaultLayout('phone', 'home', { ...facts, fresh: true }).pages[0]![0]!.id).toBe(
      'start',
    );
    expect(defaultLayout('tabletP', 'wall', facts).pages[0]!.map((x) => x.id)).toEqual([
      'month',
      'week',
      'nextdue',
      'weather',
    ]);
    // The desktop gives no service a widget of its own: they are all in the menu beside it.
    const withServices = defaultLayout('desktop', 'home', { ...facts, services: ['abc', 'def'] });
    expect(withServices.pages.flat().some((x) => x.id.startsWith('svc-'))).toBe(false);
    // One page (E-D5): an iPad in portrait no longer reaches the page that gave a service its own widget.
    expect(
      defaultLayout('tabletP', 'home', { ...facts, services: ['abc'] })
        .pages.flat()
        .map((x) => x.id),
    ).not.toContain('svc-abc');
    // Every starting layout is one page that fills its grid exactly: no holes, nothing hidden.
    for (const device of ['desktop', 'tabletL', 'tabletP', 'phone'] as const)
      for (const split of [true, false])
        for (const postcode of [true, false])
          for (const fresh of [true, false])
            for (const services of [[], ['abc', 'def']]) {
              const l = defaultLayout(device, 'home', { split, postcode, fresh, services });
              const [cols, rows] = gridFor(device, l.density);
              const ids = l.pages.flat().map((x) => x.id);
              expect(new Set(ids).size).toBe(ids.length);
              expect(l.pages.length).toBe(1);
              expect(pack(l.pages, cols, rows).length).toBe(1);
              // A new household's last page may be part-filled; every other page is full.
              l.pages.forEach((pg, i) => {
                const area = pg.reduce((a, x) => a + x.w * x.h, 0);
                if (fresh && i === l.pages.length - 1)
                  expect(area).toBeLessThanOrEqual(cols * rows);
                else expect(area).toBe(cols * rows);
              });
            }
  });

  it('moves a saved desktop Home onto four by three, keeping every widget in order', () => {
    const five = {
      density: 'standard' as const,
      pages: [
        [
          { id: 'month', w: 2, h: 2 },
          { id: 'nextdue', w: 2, h: 1 },
          { id: 'weather', w: 1, h: 1 },
          { id: 'owes', w: 2, h: 1 },
          { id: 'inbox', w: 1, h: 1 },
          { id: 'week', w: 2, h: 1 },
          { id: 'services', w: 2, h: 1 },
          { id: 'actions', w: 1, h: 1 },
        ],
      ],
    };
    const four = toFourByThree('desktop', 'home', five);
    expect(four.density).toBe('comfy');
    expect(four.pages.flat().map((x) => x.id)).toEqual(five.pages[0]!.map((x) => x.id));
    expect(four.pages.flat().map((x) => [x.w, x.h])).toEqual(five.pages[0]!.map((x) => [x.w, x.h]));
    // One page (E-D5): what four by three has no room for is hidden, not on another page.
    expect(four.pages.length).toBe(1);
    expect(hidden(pack(four.pages, 4, 3)).map((x) => x.id)).toEqual(['services', 'actions']);
    // The phone and the wall keep theirs.
    expect(toFourByThree('phone', 'home', five)).toBe(five);
    expect(toFourByThree('desktop', 'wall', five)).toBe(five);
  });

  it('only trusts a stored layout of the right shape', () => {
    expect(parseLayout({ density: 'comfy', pages: [[{ id: 'month', w: 2, h: 2 }]] })).toEqual({
      density: 'comfy',
      pages: [[{ id: 'month', w: 2, h: 2 }]],
    });
    expect(parseLayout({ density: 'huge', pages: [] })).toBeNull();
    expect(parseLayout({ density: 'comfy', pages: [[{ id: 'x', w: 0, h: 1 }]] })).toBeNull();
    expect(parseLayout({ density: 'comfy', pages: [[{ id: '<b>', w: 1, h: 1 }]] })).toBeNull();
    expect(parseLayout('nope')).toBeNull();
  });
});

describe('the week’s facts', () => {
  it('sorts what’s due into overdue, soon and later, and notices the weather', () => {
    const item = (serviceName: string, days: number) => ({
      serviceName,
      days,
      dueDate: '2026-10-01',
      amountMinor: 100,
      share: false,
      instalment: null,
    });
    const w = weekFacts(
      [item('Rent', -2), item('Gas', 0), item('Water', 1), item('Power', 5), item('Net', 12)],
      [
        {
          fromName: 'Sam',
          toName: 'Alex',
          amountMinor: 5,
          serviceName: 'Rent',
          overdue: true,
          involvesYou: true,
        },
        {
          fromName: 'Sam',
          toName: 'Jordan',
          amountMinor: 7,
          serviceName: 'Gas',
          overdue: true,
          involvesYou: false,
        },
      ],
      [
        { heating: true, cooling: false },
        { heating: true, cooling: false },
        { heating: false, cooling: false },
        { heating: true, cooling: false },
      ],
    );
    expect(w.overdue.map((x) => x.serviceName)).toEqual(['Rent']);
    expect(w.soon.map((x) => x.serviceName)).toEqual(['Gas', 'Water']);
    expect(w.later.map((x) => x.serviceName)).toEqual(['Power']);
    expect(w.debt).toEqual({
      fromName: 'Sam',
      toName: 'Jordan',
      amountMinor: 7,
      serviceName: 'Gas',
    });
    expect(w.cold).toBe(2);
  });
});

describe('saved layouts', () => {
  let dir: string;
  let db: Db;
  let close: () => void;

  beforeAll(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hud-home-layout-'));
    runMigrations(dir);
    const opened = openDb(dir);
    db = opened.db;
    close = () => opened.sqlite.close();
  });

  afterAll(() => {
    close();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('are per person and kind of screen, and fall back to the default', () => {
    const hh = createHousehold(
      {
        name: 'Riverside House',
        currency: 'AUD',
        locale: 'en-AU',
        timezone: 'Australia/Melbourne',
        fiscalYearStartMonth: 7,
        splitMode: 'shared',
      },
      db,
    );
    const alex = createMember(hh.id, { name: 'Alex', activeFrom: '2026-01-01' }, db);
    const jordan = createMember(hh.id, { name: 'Jordan', activeFrom: '2026-01-01' }, db);
    const mine = { density: 'dense' as const, pages: [[{ id: 'week', w: 2, h: 1 }]] };
    saveLayout(hh.id, alex.id, 'phone', 'home', mine, db);
    saveLayout(hh.id, alex.id, 'phone', 'home', mine, db); // saving again replaces
    const alexs = layoutsFor(hh.id, alex.id, 'home', facts, db);
    expect(alexs.phone).toEqual(mine);
    expect(alexs.desktop).toEqual(defaultLayout('desktop', 'home', facts));
    expect(layoutsFor(hh.id, jordan.id, 'home', facts, db).phone).toEqual(
      defaultLayout('phone', 'home', facts),
    );
    expect(layoutsFor(hh.id, alex.id, 'wall', facts, db).phone).toEqual(
      defaultLayout('phone', 'wall', facts),
    );
    resetLayout(hh.id, alex.id, 'phone', 'home', db);
    expect(layoutsFor(hh.id, alex.id, 'home', facts, db).phone).toEqual(
      defaultLayout('phone', 'home', facts),
    );
  });
});

describe('the three widget sizes', () => {
  it('are Small, Medium and Large', () => {
    expect(SIZE_LIST).toEqual([
      [1, 1],
      [2, 1],
      [2, 2],
    ]);
  });

  it('names the nearest size for any older block size', () => {
    expect(sizeName(1, 1)).toBe('small');
    for (const w of [2, 3, 4, 5]) expect(sizeName(w, 1)).toBe('medium');
    for (const [w, h] of [
      [2, 2],
      [3, 2],
      [4, 2],
      [5, 2],
      [2, 3],
      // One block wide and two high was never offered; it still lands on Large.
      [1, 2],
    ] as const)
      expect(sizeName(w, h)).toBe('large');
  });

  it('converts a saved layout, keeping every widget and its order', () => {
    const pages = [
      [
        { id: 'month', w: 2, h: 2 },
        { id: 'week', w: 3, h: 1 },
        { id: 'weather', w: 1, h: 1 },
        { id: 'activity', w: 3, h: 2 },
      ],
      [{ id: 'calendar', w: 2, h: 3 }],
    ];
    expect(convertPages(pages)).toEqual([
      [
        { id: 'month', w: 2, h: 2 },
        { id: 'week', w: 2, h: 1 },
        { id: 'weather', w: 1, h: 1 },
        { id: 'activity', w: 2, h: 2 },
      ],
      [{ id: 'calendar', w: 2, h: 2 }],
    ]);
    // Only the widgets named are converted while the rest keep their older sizes.
    expect(convertPages(pages, (id) => id === 'week')[0]).toEqual([
      { id: 'month', w: 2, h: 2 },
      { id: 'week', w: 2, h: 1 },
      { id: 'weather', w: 1, h: 1 },
      { id: 'activity', w: 3, h: 2 },
    ]);
  });

  it('packs a converted page, hiding what no longer fits', () => {
    const converted = convertPages([
      [
        { id: 'a', w: 2, h: 3 },
        { id: 'b', w: 2, h: 2 },
        { id: 'c', w: 2, h: 1 },
      ],
    ]);
    // A phone at two by four: two Larges fill the page, the Medium is hidden until there is room.
    const packed = pack(converted, 2, 4);
    expect(packed[0]!.map((x) => x.id)).toEqual(['a', 'b']);
    expect(hidden(packed).map((x) => x.id)).toEqual(['c']);
  });
});

describe('a measurement inside a gauge', () => {
  it('keeps a short unit on the number’s line and puts a long one underneath', () => {
    expect(unitInline('412', 'L')).toBe(true);
    expect(unitInline('6.8', 'L')).toBe(true);
    expect(unitInline('6.8', 'kWh')).toBe(false);
    expect(unitInline('41', 'MJ')).toBe(true);
    // The decimal point counts as a character.
    expect(unitInline('12.5', 'L')).toBe(false);
    expect(unitInline('1,204', 'L')).toBe(false);
  });
});

describe('a saved layout brought up to date', () => {
  const stored = (pages: unknown) => parseLayout({ density: 'standard', pages })!.pages;

  it('gives every widget the nearest of the three sizes', () => {
    expect(
      stored([
        [
          { id: 'month', w: 4, h: 2 },
          { id: 'nextdue', w: 2, h: 3 },
          { id: 'weather', w: 3, h: 1 },
          { id: 'svc-abc', w: 2, h: 1 },
          { id: 'week', w: 3, h: 1 },
        ],
      ]),
    ).toEqual([
      [
        { id: 'month', w: 2, h: 2 },
        { id: 'nextdue', w: 2, h: 2 },
        { id: 'weather', w: 2, h: 1 },
        { id: 'svc-abc', w: 2, h: 1 },
        { id: 'week', w: 2, h: 1 },
      ],
    ]);
  });

  it('folds Shares settled into Settle up', () => {
    // Both on Home: Settle up stays, Shares settled goes.
    expect(
      stored([[{ id: 'owes', w: 2, h: 1 }], [{ id: 'settled', w: 1, h: 1 }]]).map((pg) =>
        pg.map((x) => x.id),
      ),
    ).toEqual([['owes']]);
    // Only Shares settled: it becomes Settle up, where it was, at its size.
    expect(
      stored([
        [
          { id: 'settled', w: 1, h: 1 },
          { id: 'week', w: 2, h: 1 },
        ],
      ]),
    ).toEqual([
      [
        { id: 'owes', w: 1, h: 1 },
        { id: 'week', w: 2, h: 1 },
      ],
    ]);
  });

  it('starts every screen with sizes the widgets have', () => {
    for (const device of ['desktop', 'tabletL', 'tabletP', 'phone'] as const)
      for (const fresh of [false, true])
        for (const it of defaultLayout(device, 'home', { ...facts, fresh }).pages.flat()) {
          expect(it.id).not.toBe('settled');
          expect(SIZE_LIST).toContainEqual([it.w, it.h]);
        }
  });

  it('fits its grid to the room on the stack: rows from the height, columns from the width', () => {
    // 1,440 × 900 (Home 1,052 × 780, 14 px gaps): large blocks, four by three.
    expect(stackGrid('comfy', 1052, 780, 14)).toEqual([4, 3]);
    // A 16-inch MacBook Pro (Home about 1,340 × 880): five by three.
    expect(stackGrid('comfy', 1340, 880, 14)).toEqual([5, 3]);
    expect(stackGrid('comfy', 1100, 780, 14)).toEqual([4, 3]);
    // A big monitor: more rows and columns of blocks the same size.
    expect(stackGrid('comfy', 2172, 1280, 14)).toEqual([8, 5]);
    // Medium and small blocks at 1,440 × 900.
    expect(stackGrid('standard', 1052, 780, 14)).toEqual([5, 4]);
    expect(stackGrid('dense', 1052, 780, 14)).toEqual([7, 5]);
    // Never fewer than two rows or three columns, never more than six or ten.
    expect(stackGrid('comfy', 600, 860, 14)).toEqual([3, 3]);
    expect(stackGrid('comfy', 900, 300, 14)[1]).toBe(2);
    expect(stackGrid('dense', 4000, 500, 14)).toEqual([10, 3]);
  });

  it('shows the same one page on a wider grid, with room to spare', () => {
    const l = defaultLayout('desktop', 'home', facts);
    const five = pack(l.pages, 5, 3);
    expect(five.length).toBe(1);
    expect(five[0]!.map((x) => x.id)).toEqual(l.pages[0]!.map((x) => x.id));
    expect(five[0]!.reduce((a, x) => a + x.w * x.h, 0)).toBe(12);
  });
});
