import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';
import { hasIcon } from '@/components/app/icons';
import { niceTicks, smoothPath, spread } from '@/components/charts/math';
import { formatMoneyParts } from '@/lib/format';
import { colourCss, PALETTE } from '@/lib/palette';

const root = path.resolve(import.meta.dirname, '..');
const studio = path.join(root, 'brand-identity/inspiration/redesign-studio');

describe('icons', () => {
  it('draws every icon the studio draws (bar its own chrome), and no sparkles', () => {
    const src = fs.readFileSync(path.join(studio, 'js/icons.js'), 'utf8');
    const ctx = { window: {} as { HU?: { icons: Record<string, string> } } };
    vm.runInNewContext(src, ctx);
    const studioOnly = new Set([
      'tablet',
      'nav-bottom',
      'nav-top',
      'nav-left',
      'nav-right',
      'rule',
      'swatch',
    ]);
    const missing = Object.keys(ctx.window.HU!.icons).filter(
      (n) => !studioOnly.has(n) && !hasIcon(n),
    );
    expect(missing).toEqual([]);
    expect(hasIcon('sparkle')).toBe(false);
    // The names the older screens still use.
    for (const n of ['people', 'gear', 'ledger', 'wall', 'receipt']) expect(hasIcon(n)).toBe(true);
  });
});

describe('chart maths', () => {
  it('picks round ticks that cover the range', () => {
    expect(niceTicks(2100, 3200, 3)).toEqual([2000, 2500, 3000, 3500]);
    expect(niceTicks(0, 1, 4)).toEqual([0, 0.25, 0.5, 0.75, 1]);
    expect(niceTicks(4.5, 5.5, 3)).toEqual([4.5, 5, 5.5]);
  });

  it('spreads points across the width and draws a smooth path through them', () => {
    const pts = spread([1, 3, 2], (v) => 100 - v * 10);
    expect(pts).toEqual([
      [0, 90],
      [50, 70],
      [100, 80],
    ]);
    const d = smoothPath(pts);
    expect(d.startsWith('M0,90 C')).toBe(true);
    expect(d.endsWith('100.00,80.00')).toBe(true);
    expect(smoothPath([[0, 0]])).toBe('');
    expect(spread([4], () => 1)).toEqual([[50, 1]]);
  });
});

describe('formatMoneyParts', () => {
  it('splits the cents off so they can be set smaller', () => {
    expect(formatMoneyParts(48621, 'AUD', 'en-AU')).toEqual({
      main: '$486',
      minor: '.21',
      tail: '',
    });
    expect(formatMoneyParts(1250, 'EUR', 'de-DE')).toEqual({
      main: '12',
      minor: ',50',
      tail: '\u00a0€',
    });
    expect(formatMoneyParts(500, 'JPY', 'ja-JP')).toEqual({ main: '￥500', minor: '', tail: '' });
  });
});

describe('service colours', () => {
  it('turn into tokens that carry both theme steps; other colours pass through', () => {
    const css = fs.readFileSync(path.join(root, 'src/app/globals.css'), 'utf8');
    for (const p of PALETTE) {
      expect(colourCss(p.light)).toBe(`var(--sc-${p.name})`);
      expect(colourCss(p.light.toUpperCase())).toBe(`var(--sc-${p.name})`);
      expect(css).toContain(`--sc-${p.name}: ${p.light};`);
      expect(css).toContain(`--sc-${p.name}: ${p.dark};`);
    }
    expect(colourCss('#123456')).toBe('#123456');
    expect(colourCss('var(--p-accent)')).toBe('var(--p-accent)');
  });
});
