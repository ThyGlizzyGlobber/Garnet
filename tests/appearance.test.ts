import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { openDb, type Db } from '@/db/client';
import { runMigrations } from '@/db/migrate';
import { APPEARANCE_PRESETS } from '@/db/schema';
import {
  DEFAULT_APPEARANCE,
  formatAppearance,
  parseAppearance,
  PRESET_BG,
  themeColor,
} from '@/lib/appearance';
import { signInAccount } from '@/lib/accounts';
import { createHousehold } from '@/lib/households';
import { createMember, getMember, updateMember } from '@/lib/members';
import { setUpHousehold } from '@/lib/setup';

const root = path.resolve(import.meta.dirname, '..');
const css = fs.readFileSync(path.join(root, 'src/app/globals.css'), 'utf8');
const messages = JSON.parse(fs.readFileSync(path.join(root, 'messages/en.json'), 'utf8'));

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

describe('colour presets in globals.css', () => {
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

  it.each(APPEARANCE_PRESETS)('%s has a light set and both dark sets, each complete', (p) => {
    const blocks = blocksFor(p);
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

  it.each(APPEARANCE_PRESETS)('%s: theme-color matches the page colour', (p) => {
    const blocks = blocksFor(p);
    const light = blocks.find((b) => !b.selector.includes('dark') && !b.selector.includes(':not'));
    const dark = blocks.find((b) => b.selector.includes("[data-theme='dark']"));
    expect(light!.tokens.get('--p-bg')).toBe(PRESET_BG[p].light);
    expect(dark!.tokens.get('--p-bg')).toBe(PRESET_BG[p].dark);
  });

  it.each(APPEARANCE_PRESETS)('%s has a name and a line in the messages', (p) => {
    expect(messages.appearance.presets[p].name).toBeTruthy();
    expect(messages.appearance.presets[p].blurb).toBeTruthy();
  });
});

describe('parseAppearance', () => {
  it('reads what formatAppearance wrote', () => {
    const a = { preset: 'ruby', theme: 'dark' } as const;
    expect(parseAppearance(formatAppearance(a))).toEqual(a);
  });

  it('falls back to Harbour and automatic for anything it can’t read', () => {
    expect(parseAppearance(undefined)).toEqual(DEFAULT_APPEARANCE);
    expect(parseAppearance('')).toEqual(DEFAULT_APPEARANCE);
    expect(parseAppearance('neon.dark')).toEqual({ preset: 'harbour', theme: 'dark' });
    expect(parseAppearance('violet.dusk')).toEqual({ preset: 'violet', theme: 'auto' });
    expect(DEFAULT_APPEARANCE).toEqual({ preset: 'harbour', theme: 'auto' });
  });
});

describe('themeColor', () => {
  it('gives one colour when light or dark is chosen', () => {
    expect(themeColor({ preset: 'cobalt', theme: 'light' })).toBe('#e4e9f3');
    expect(themeColor({ preset: 'cobalt', theme: 'dark' })).toBe('#080d1a');
  });

  it('gives both, by device setting, when automatic', () => {
    expect(themeColor({ preset: 'mist', theme: 'auto' })).toEqual([
      { media: '(prefers-color-scheme: light)', color: '#e9e4dc' },
      { media: '(prefers-color-scheme: dark)', color: '#12151b' },
    ]);
  });
});

describe('a member’s appearance', () => {
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

  it('starts on Harbour, automatic, and keeps what the person picks', () => {
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
    expect([alex.appearancePreset, alex.theme]).toEqual(['harbour', 'auto']);
    expect(getMember(hh.id, alex.id, db)).toMatchObject({
      appearancePreset: 'harbour',
      theme: 'auto',
    });

    updateMember(hh.id, alex.id, { appearancePreset: 'violet', theme: 'dark' }, db);
    expect(getMember(hh.id, alex.id, db)).toMatchObject({
      appearancePreset: 'violet',
      theme: 'dark',
    });

    const sam = createMember(
      hh.id,
      { name: 'Sam', activeFrom: '2026-01-01', appearancePreset: 'ruby', theme: 'light' },
      db,
    );
    expect(getMember(hh.id, sam.id, db)).toMatchObject({
      appearancePreset: 'ruby',
      theme: 'light',
    });
  });
  it('the setup wizard keeps the first admin’s own colour and their colours for the app (§4a)', () => {
    const account = signInAccount({ email: 'casey@example.com', name: 'Casey' }, db);
    const { householdId, ownerId } = setUpHousehold(
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
        owner: {
          name: 'Casey',
          activeFrom: '2026-01-01',
          colour: '#1baf7a',
          appearance: { preset: 'ruby', theme: 'dark' },
        },
        location: null,
        shareRegional: true,
      },
      db,
    );
    expect(getMember(householdId, ownerId, db)).toMatchObject({
      colour: '#1baf7a',
      appearancePreset: 'ruby',
      theme: 'dark',
      accountId: account.id,
    });
  });
});
