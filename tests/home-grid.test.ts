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
    expect(normalise([[], [{ id: 'y', w: 1, h: 1 }], []], 5, 3)).toEqual([
      [{ id: 'y', w: 1, h: 1 }],
    ]);
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
    expect(
      moveItem(pages, packed, 'c', { page: 0, r: 0, c: 0 }, 5, 3)[0]!.map((x) => x.id),
    ).toEqual(['c', 'a', 'b']);
    // a dropped on an empty block after everything: it goes to the end.
    expect(
      moveItem(pages, packed, 'a', { page: 0, r: 2, c: 4 }, 5, 3)[0]!.map((x) => x.id),
    ).toEqual(['b', 'c', 'a']);
    // Dropped onto a later page: the page is made.
    const moved = moveItem(pages, packed, 'a', { page: 1, r: 0, c: 0 }, 5, 3);
    expect(moved.map((pg) => pg.map((x) => x.id))).toEqual([['b', 'c'], ['a']]);
    // Dropped on itself: nothing changes.
    expect(moveItem(pages, packed, 'a', { page: 0, r: 0, c: 0 }, 5, 3)).toBe(pages);
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

  it('starts every household on full pages, whatever it can show', () => {
    const noSplit = { split: false, postcode: true, fresh: false };
    expect(available('owes', noSplit)).toBe(false);
    expect(available('postcode', facts)).toBe(false);
    expect(available('weather', { ...facts, postcode: false })).toBe(false);
    expect(available('start', facts)).toBe(false);
    const d = defaultLayout('desktop', 'home', facts);
    expect(d.density).toBe('standard');
    expect(d.pages[0]!.map((x) => x.id)).toEqual([
      'month',
      'nextdue',
      'weather',
      'owes',
      'inbox',
      'week',
      'services',
      'actions',
    ]);
    // Not splitting: Monthly cost takes Settle up's place, and page two still has no widget twice.
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
    // A household's first service gets a widget of its own on page two.
    const withServices = defaultLayout('desktop', 'home', { ...facts, services: ['abc', 'def'] });
    expect(withServices.pages[1]!.map((x) => x.id)).toContain('svc-abc');
    expect(withServices.pages.flat().map((x) => x.id)).not.toContain('season');
    // Every page of every starting layout fills its grid exactly: no holes, nothing pushed on.
    for (const device of ['desktop', 'tabletL', 'tabletP', 'phone'] as const)
      for (const split of [true, false])
        for (const postcode of [true, false])
          for (const fresh of [true, false]) {
            const l = defaultLayout(device, 'home', { split, postcode, fresh });
            const [cols, rows] = gridFor(device, l.density);
            const ids = l.pages.flat().map((x) => x.id);
            expect(new Set(ids).size).toBe(ids.length);
            expect(pack(l.pages, cols, rows).length).toBe(l.pages.length);
            // A new household's last page may be part-filled; every other page is full.
            l.pages.forEach((pg, i) => {
              const area = pg.reduce((a, x) => a + x.w * x.h, 0);
              if (fresh && i === l.pages.length - 1) expect(area).toBeLessThanOrEqual(cols * rows);
              else expect(area).toBe(cols * rows);
            });
          }
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

  it('packs a converted page, moving what no longer fits to the next one', () => {
    const converted = convertPages([
      [
        { id: 'a', w: 2, h: 3 },
        { id: 'b', w: 2, h: 2 },
        { id: 'c', w: 2, h: 1 },
      ],
    ]);
    // A phone at two by four: two Larges fill the page, the Medium moves on.
    expect(normalise(converted, 2, 4)).toEqual([
      [
        { id: 'a', w: 2, h: 2 },
        { id: 'b', w: 2, h: 2 },
      ],
      [{ id: 'c', w: 2, h: 1 }],
    ]);
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
    ).toEqual([['owes'], []]);
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
});
