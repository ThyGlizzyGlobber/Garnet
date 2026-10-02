import { describe, expect, it } from 'vitest';
import {
  arrange,
  exampleGroupName,
  orderChildren,
  arrangeMine,
  parseNavLayout,
  suggestGroupName,
  type NavLine,
} from '@/lib/nav-layout';

/** The side menu's groups (owner, 2026-10-02): the rules, without a database. */
const own = (typeSlug: string): NavLine => ({ key: `s:${typeSlug}`, typeSlug, category: null });
const main = (category: NavLine['category']): NavLine => ({
  key: `c:${category}`,
  typeSlug: null,
  category,
});

describe('suggestGroupName', () => {
  it('offers a name from what’s in the group', () => {
    const essentials = ['internet', 'electricity', 'gas', 'water', 'phone', 'rent'].map((s) =>
      own(s),
    );
    expect(suggestGroupName(essentials)).toBe('Essentials');
    expect(suggestGroupName([own('electricity'), own('gas')])).toBe('Energy');
    expect(suggestGroupName([own('electricity'), own('water'), own('internet')])).toBe('Utilities');
    expect(suggestGroupName([own('internet'), own('phone')])).toBe('Internet & Phone');
    expect(suggestGroupName([own('rent'), main('home')])).toBe('Home');
    expect(
      suggestGroupName([
        { key: 't:subscriptions', typeSlug: 'subscriptions', category: null },
        main('lifestyle'),
      ]),
    ).toBe('Leisure');
    expect(suggestGroupName([main('health'), main('vehicle')])).toBe('Cover & Upkeep');
    expect(suggestGroupName([own('electricity'), main('vehicle')])).toBe('Household Bills');
    expect(suggestGroupName([])).toBe('Household Bills');
  });

  it('takes the new-group example from the theme most ungrouped services share', () => {
    const subs = { key: 't:subscriptions', typeSlug: 'subscriptions', category: null };
    const gifts = { key: 't:donations', typeSlug: 'donations', category: null };
    // Someone's own: health and a gym, subscriptions and giving, a car.
    expect(
      exampleGroupName([main('health'), main('vehicle'), subs, main('lifestyle'), gifts]),
    ).toBe('Health & Fitness');
    expect(exampleGroupName([main('vehicle'), subs, gifts])).toBe('Lifestyle & Giving');
    expect(exampleGroupName([main('vehicle')])).toBe('Transport');
    // The household's: the everyday bills while they're in no group.
    expect(exampleGroupName([own('electricity'), own('water'), main('home'), own('rent')])).toBe(
      'Essentials',
    );
  });
});

describe('arrange and parseNavLayout', () => {
  const entries = ['s:a', 's:b', 'c:home', 's:c'];
  const essential = (k: string) => k === 's:c';

  it('puts the everyday bills first when nothing is arranged', () => {
    expect(arrange(entries, (k) => k, null, essential)).toEqual([
      { group: null, entries: ['s:c', 's:a', 's:b', 'c:home'] },
    ]);
  });

  it('follows a saved layout, groups first, skipping what’s gone and adding what’s new to no group', () => {
    const layout = parseNavLayout(
      JSON.stringify({
        loose: ['s:b', 's:gone'],
        groups: [
          { id: 'g1', name: 'House', items: ['c:home', 's:a'] },
          { id: 'g2', name: 'Empty', items: [] },
        ],
      }),
    )!;
    const out = arrange(entries, (k) => k, layout, essential);
    expect(out.map((s) => [s.group?.name ?? null, s.entries])).toEqual([
      ['House', ['c:home', 's:a']],
      ['Empty', []],
      [null, ['s:b', 's:c']],
    ]);
  });

  it('refuses shapes it doesn’t know and keeps each line once', () => {
    expect(parseNavLayout('nope')).toBeNull();
    expect(parseNavLayout({ loose: [] })).toBeNull();
    const l = parseNavLayout({
      loose: ['s:a', 'bad key', 42],
      groups: [{ id: 'g1', name: '  Bills  ', items: ['s:a', 's:b'] }, null],
    })!;
    // A line in a group and in no group stays in the group; My Services holds only "m" keys.
    expect(l).toEqual({
      loose: [],
      groups: [{ id: 'g1', name: 'Bills', items: ['s:a', 's:b'] }],
      mine: [],
      mineGroups: [],
      children: {},
    });
  });

  it('lays out My Services like the household’s: own groups, then the rest, new ones last', () => {
    const layout = parseNavLayout({
      loose: [],
      groups: [],
      mine: ['mc:health', 's:x', 'ms:b'],
      mineGroups: [{ id: 'p1', name: 'Car', items: ['mc:vehicle', 's:household'] }],
    })!;
    // Only the person's own lines in My Services and its groups.
    expect(layout.mine).toEqual(['mc:health', 'ms:b']);
    expect(layout.mineGroups).toEqual([{ id: 'p1', name: 'Car', items: ['mc:vehicle'] }]);
    const out = arrangeMine(['ms:a', 'ms:b', 'mc:health', 'mc:vehicle'], (k) => k, layout);
    expect(out.map((s) => [s.group?.name ?? null, s.entries])).toEqual([
      ['Car', ['mc:vehicle']],
      [null, ['mc:health', 'ms:b', 'ms:a']],
    ]);
  });

  it('keeps the order inside main services, the household’s then the person’s own', () => {
    const layout = parseNavLayout({
      loose: [],
      groups: [],
      mine: [],
      children: { 'c:health': ['b', 'a'], 'mc:health': ['z'], 'bad key': ['x'] },
    })!;
    expect(Object.keys(layout.children)).toEqual(['c:health', 'mc:health']);
    expect(
      orderChildren(['a', 'z', 'b', 'new'], (x) => x, layout, ['c:health', 'mc:health']),
    ).toEqual(['b', 'a', 'z', 'new']);
    expect(orderChildren(['a', 'b'], (x) => x, null, ['c:health'])).toEqual(['a', 'b']);
  });
});
