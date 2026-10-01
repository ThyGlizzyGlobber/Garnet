import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { openDb, type Db } from '@/db/client';
import { runMigrations } from '@/db/migrate';
import {
  DEFAULT_APPEARANCE,
  formatAppearance,
  parseAppearance,
  SCHEME,
  SCHEME_BG,
  themeColor,
} from '@/lib/appearance';
import { getAccount, setAccountAppearance, signInAccount } from '@/lib/accounts';
import { setUpHousehold } from '@/lib/setup';

const root = path.resolve(import.meta.dirname, '..');
const css = fs.readFileSync(path.join(root, 'src/app/globals.css'), 'utf8');

/** Every declaration block whose selector list mentions this preset, keyed by selector text. */
function blocksFor(preset: string): { selector: string; tokens: Map<string, string> }[] {
  const out: { selector: string; tokens: Map<string, string> }[] = [];
  for (const m of css.matchAll(/([^{}]*)\{([^{}]*)\}/g)) {
    const selector = m[1]!.trim();
    if (!selector.includes(`[data-palette='${preset}']`)) continue;
    const tokens = new Map(
      [...m[2]!.matchAll(/(--p-[\w-]+):\s*([^;]+);/g)].map((d) => [
        d[1]!,
        d[2]!.replace(/\s+/g, ' ').trim(),
      ]),
    );
    out.push({ selector, tokens });
  }
  return out;
}

describe('the one colour scheme in globals.css', () => {
  const tokenNames = [
    '--p-bg',
    '--p-ground',
    '--p-blob1',
    '--p-blob2',
    '--p-blob3',
    '--p-blob4',
    '--p-accent',
    '--p-accent2',
    '--p-on-accent',
    '--p-fg',
    '--p-fg2',
    '--p-fg3',
  ];

  it('has a light set and both dark sets, each complete', () => {
    const blocks = blocksFor(SCHEME);
    const light = blocks.filter(
      (b) => !b.selector.includes('dark') && !b.selector.includes(':not'),
    );
    const dark = blocks.filter((b) => b.selector.includes("[data-theme='dark']"));
    const auto = blocks.filter((b) => b.selector.includes(":not([data-theme='light'])"));
    expect([light.length, dark.length, auto.length]).toEqual([1, 1, 1]);
    for (const b of blocks) expect([...b.tokens.keys()].sort()).toEqual([...tokenNames].sort());
    // The dark set is the same whether it's forced or follows the device.
    expect(Object.fromEntries(auto[0]!.tokens)).toEqual(Object.fromEntries(dark[0]!.tokens));
  });

  it('theme-color matches the page colour', () => {
    const blocks = blocksFor(SCHEME);
    const light = blocks.find((b) => !b.selector.includes('dark') && !b.selector.includes(':not'));
    const dark = blocks.find((b) => b.selector.includes("[data-theme='dark']"));
    expect(light!.tokens.get('--p-bg')).toBe(SCHEME_BG.light);
    expect(dark!.tokens.get('--p-bg')).toBe(SCHEME_BG.dark);
  });
});

describe('the appearance cookie', () => {
  it('round-trips and falls back to the default', () => {
    expect(formatAppearance({ theme: 'dark', glass: 'clear' })).toBe('dark.clear');
    expect(parseAppearance('dark.clear')).toEqual({ theme: 'dark', glass: 'clear' });
    expect(parseAppearance('dusk.frosty')).toEqual({ theme: 'auto', glass: 'auto' });
    expect(parseAppearance(undefined)).toEqual(DEFAULT_APPEARANCE);
    // Cookies from the preset days read "preset.theme.glass"; the preset is ignored.
    expect(parseAppearance('violet.light.solid')).toEqual({ theme: 'light', glass: 'solid' });
    expect(parseAppearance('ruby.dark')).toEqual({ theme: 'dark', glass: 'auto' });
    expect(DEFAULT_APPEARANCE).toEqual({ theme: 'auto', glass: 'auto' });
  });
});

describe('themeColor', () => {
  it('gives one colour when light or dark is chosen', () => {
    expect(themeColor({ theme: 'light' })).toBe(SCHEME_BG.light);
    expect(themeColor({ theme: 'dark' })).toBe(SCHEME_BG.dark);
  });

  it('gives both, by device setting, when automatic', () => {
    expect(themeColor({ theme: 'auto' })).toEqual([
      { media: '(prefers-color-scheme: light)', color: SCHEME_BG.light },
      { media: '(prefers-color-scheme: dark)', color: SCHEME_BG.dark },
    ]);
  });
});

describe('an account’s appearance', () => {
  let dir: string;
  let db: Db;
  let close: () => void;

  beforeAll(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hud-appearance-'));
    runMigrations(dir);
    const opened = openDb(dir);
    db = opened.db;
    close = () => opened.sqlite.close();
  });

  afterAll(() => {
    close();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('starts automatic and keeps what the person picks, on the account not the household', () => {
    const account = signInAccount({ email: 'casey@example.com', name: 'Casey' }, db);
    expect([account.theme, account.glass]).toEqual(['auto', 'auto']);
    setAccountAppearance(account.id, { theme: 'dark', glass: 'solid' }, db);
    expect(getAccount(account.id, db)).toMatchObject({ theme: 'dark', glass: 'solid' });

    const { ownerId } = setUpHousehold(
      account,
      {
        household: {
          name: 'Test House',
          currency: 'AUD',
          locale: 'en-AU',
          timezone: 'Australia/Melbourne',
          fiscalYearStartMonth: 7,
          splitMode: 'shared',
        },
        owner: { name: 'Casey', activeFrom: '2026-01-01', colour: '#1baf7a' },
        location: null,
        shareRegional: true,
      },
      db,
    );
    expect(ownerId).toBeTruthy();
    // Starting a household changes nothing about how the app looks for them.
    expect(getAccount(account.id, db)).toMatchObject({ theme: 'dark', glass: 'solid' });
  });
});
