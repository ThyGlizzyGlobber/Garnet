import { isEssential, type GroupedCategory } from '@/lib/service-categories';

/**
 * How someone arranges the services in the side menu (owner, 2026-10-02):
 * groups of their own, named as they like, in their order, each holding
 * services in their order. The Services page shows the same groups in the
 * same order. Kept per member (member.nav_layout), since everyone sees their
 * own services too.
 *
 * Every line is a key: "s:<service id>" for a service on its own,
 * "c:<category>" for a main service (Vehicles, Home & Property), and
 * "t:<type>" for a type holding sub-services (Subscriptions, Donations);
 * the person's own services are the same with an "m" in front ("mc:health").
 * Services in no group come after the groups, in their own order (under
 * "Other Services" once there are groups; with none, they are the whole list).
 * Last comes My Services, the person's own, laid out the same way: their
 * own groups, then their own services in no group (only their own services
 * go in those groups, and none of the household's). Inside a main service, its services (or
 * Vehicles' vehicles) keep the person's order too, by the main service's key;
 * the main service's page shows them in it.
 * A service added later joins those; a key that no longer exists is skipped.
 * Pure, so the menu's editor can use it; storing is src/lib/nav-store.ts.
 */

export interface NavGroup {
  id: string;
  name: string;
  items: string[];
}

export interface NavLayout {
  /** In no group: after the groups. */
  loose: string[];
  groups: NavGroup[];
  /** My Services, the person's own, in no group of theirs: after their own groups. */
  mine: string[];
  /** The person's own groups inside My Services, first there. */
  mineGroups: NavGroup[];
  /** Inside a main service ("c:vehicle", "mt:donations"): its services' or vehicles' ids in order. */
  children: Record<string, string[]>;
}

/** What a key stands for, as far as naming a group goes. */
export interface NavLine {
  key: string;
  /** The type of a service on its own; null for a main service. */
  typeSlug: string | null;
  category: GroupedCategory | null;
}

export const MAX_GROUPS = 12;
const MAX_NAME = 40;

/**
 * The key of a line from groupServices(): a service on its own, a main
 * service, or a type with sub-services; "m…" among the person's own.
 */
export function navKey(
  g: { category: GroupedCategory | null; typeSlug: string | null; services: { id: string }[] },
  mine = false,
): string {
  const m = mine ? 'm' : '';
  if (g.category) return `${m}c:${g.category}`;
  if (g.typeSlug) return `${m}t:${g.typeSlug}`;
  return `${m}s:${g.services[0]!.id}`;
}

/**
 * A main service's services (or vehicles) in the person's order: the
 * household's main service's order first, then their own's (a page shows
 * both); any not placed yet last, in list order.
 */
export function orderChildren<T>(
  items: T[],
  idOf: (t: T) => string,
  layout: NavLayout | null,
  keys: string[],
): T[] {
  const ids = keys.flatMap((k) => layout?.children[k] ?? []);
  const at = new Map(ids.map((id, i) => [id, i]));
  return items
    .map((t, i) => ({ t, i, at: at.get(idOf(t)) ?? Infinity }))
    .sort((a, b) => a.at - b.at || a.i - b.i)
    .map((x) => x.t);
}

/**
 * My Services in the person's order, laid out like the household's: their
 * own groups, then their own services in no group (any not placed yet among
 * them, in list order).
 */
export function arrangeMine<E>(
  entries: E[],
  keyOf: (e: E) => string,
  layout: NavLayout | null,
): ArrangedSection<E>[] {
  if (!layout) return [{ group: null, entries }];
  const byKey = new Map(entries.map((e) => [keyOf(e), e]));
  const placed = new Set<string>();
  const pick = (keys: string[]) =>
    keys.flatMap((k) => {
      const e = byKey.get(k);
      if (!e || placed.has(k)) return [];
      placed.add(k);
      return [e];
    });
  const groups = layout.mineGroups.map((g) => ({ group: g, entries: pick(g.items) }));
  const loose = pick(layout.mine);
  const rest = entries.filter((e) => !placed.has(keyOf(e)));
  return [...groups, { group: null, entries: [...loose, ...rest] }];
}

/** Before anyone arranges anything: the everyday bills first, then the rest, in catalog order. */
function defaultOrder<E>(entries: E[], essential: (e: E) => boolean): E[] {
  return [...entries.filter(essential), ...entries.filter((e) => !essential(e))];
}

export interface ArrangedSection<E> {
  /** null for the services in no group. */
  group: NavGroup | null;
  entries: E[];
}

/**
 * The lines in this person's order: each group, then the services in no
 * group (any not placed yet among them, in the default order).
 * Groups with nothing left in them are kept (the editor shows them); the
 * menu and the Services page leave them out.
 */
export function arrange<E>(
  entries: E[],
  keyOf: (e: E) => string,
  layout: NavLayout | null,
  essential: (e: E) => boolean,
): ArrangedSection<E>[] {
  const ordered = defaultOrder(entries, essential);
  if (!layout) return [{ group: null, entries: ordered }];
  const byKey = new Map(ordered.map((e) => [keyOf(e), e]));
  const placed = new Set<string>();
  const pick = (keys: string[]) =>
    keys.flatMap((k) => {
      const e = byKey.get(k);
      if (!e || placed.has(k)) return [];
      placed.add(k);
      return [e];
    });
  const groups = layout.groups.map((g) => ({ group: g, entries: pick(g.items) }));
  const loose = pick(layout.loose);
  const rest = ordered.filter((e) => !placed.has(keyOf(e)));
  return [...groups, { group: null, entries: [...loose, ...rest] }];
}

/** A stored layout, checked: unknown shapes give null (the default order). */
export function parseNavLayout(raw: unknown): NavLayout | null {
  let v = raw;
  if (typeof v === 'string') {
    try {
      v = JSON.parse(v);
    } catch {
      return null;
    }
  }
  if (!v || typeof v !== 'object') return null;
  const o = v as {
    loose?: unknown;
    groups?: unknown;
    mine?: unknown;
    mineGroups?: unknown;
    children?: unknown;
  };
  // The household's lines, or (mine) the person's own.
  const keys = (x: unknown, mine = false): string[] =>
    Array.isArray(x)
      ? x.filter(
          (k): k is string =>
            typeof k === 'string' &&
            (mine ? /^m[stc]:[\w-]{1,64}$/ : /^[stc]:[\w-]{1,64}$/).test(k),
        )
      : [];
  if (!Array.isArray(o.groups)) return null;
  const seen = new Set<string>();
  const unique = (ks: string[]) => ks.filter((k) => !seen.has(k) && (seen.add(k), true));
  // Group ids are unique across the household's groups and My Services' own.
  const ids = new Set<string>();
  const groupsOf = (raw: unknown, mine: boolean): NavGroup[] =>
    (Array.isArray(raw) ? raw : [])
      .filter((g): g is Record<string, unknown> => !!g && typeof g === 'object')
      .slice(0, MAX_GROUPS)
      .map((g, i) => {
        let id = typeof g.id === 'string' && /^[\w-]{1,32}$/.test(g.id) ? g.id : `g${i + 1}`;
        if (ids.has(id)) id = `${id}-${ids.size}`;
        ids.add(id);
        return {
          id,
          name: typeof g.name === 'string' ? g.name.trim().slice(0, MAX_NAME) : '',
          items: unique(keys(g.items, mine)),
        };
      });
  const groups = groupsOf(o.groups, false);
  const mineGroups = groupsOf(o.mineGroups, true);
  return {
    loose: unique(keys(o.loose)),
    groups,
    mine: unique(keys(o.mine, true)),
    mineGroups,
    children: parseChildren(o.children),
  };
}

/** The orders inside main services: main-service keys to ids, checked. */
function parseChildren(raw: unknown): Record<string, string[]> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: Record<string, string[]> = {};
  for (const [k, v] of Object.entries(raw).slice(0, 40)) {
    if (!/^m?[ct]:[\w-]{1,64}$/.test(k) || !Array.isArray(v)) continue;
    out[k] = [
      ...new Set(
        v.filter((id): id is string => typeof id === 'string' && /^[\w-]{1,64}$/.test(id)),
      ),
    ].slice(0, 200);
  }
  return out;
}

const ENERGY = new Set(['electricity', 'gas']);
const UTILITIES = new Set(['electricity', 'gas', 'water', 'internet', 'phone']);
const CONNECTED = new Set(['internet', 'phone']);
const HOME = new Set(['rent', 'c:home']);
const LEISURE = new Set(['subscriptions', 'c:lifestyle', 'donations']);
const FITNESS = new Set(['c:health', 'c:lifestyle']);

/** What a line is, for naming: "c:health" for a main service, else its type ("electricity"). */
const kindOf = (l: NavLine) => (l.category ? `c:${l.category}` : (l.typeSlug ?? ''));

/**
 * The themes an example name is drawn from, most familiar first: the
 * everyday bills, the home, health and fitness, subscriptions and giving,
 * the car.
 */
const THEMES = [
  new Set(['internet', 'electricity', 'gas', 'water', 'phone', 'rent']),
  HOME,
  FITNESS,
  new Set(['subscriptions', 'donations']),
  new Set(['c:vehicle']),
];

/**
 * The example in a new-group field ("e.g. Health & Fitness"): named after
 * the theme most of the services still in no group share, rather than all
 * of them at once (a mix only ever made "Everything Else").
 */
export function exampleGroupName(lines: NavLine[]): string {
  let best: NavLine[] = [];
  for (const theme of THEMES) {
    const fit = lines.filter((l) => theme.has(kindOf(l)));
    if (fit.length > best.length) best = fit;
  }
  return suggestGroupName(best.length ? best : lines);
}

/**
 * A name to offer for a group, from what's in it: the everyday bills are
 * "Essentials", electricity and gas "Energy", Subscriptions and Lifestyle
 * "Leisure"… Shown as "e.g. …" while
 * the name is empty, and used when it's left empty.
 */
export function suggestGroupName(lines: NavLine[]): string {
  if (!lines.length) return 'Household Bills';
  const kinds = lines.map(kindOf);
  const within = (set: Set<string>) => kinds.every((k) => set.has(k));
  const has = (k: string) => kinds.includes(k);
  if (within(ENERGY)) return 'Energy';
  if (within(CONNECTED)) return 'Internet & Phone';
  if (within(UTILITIES)) return 'Utilities';
  if (lines.every((l) => !l.category && l.typeSlug && isEssential({ slug: l.typeSlug })))
    return 'Essentials';
  if (within(HOME)) return 'Home';
  if (within(new Set(['c:vehicle']))) return 'Transport';
  if (within(new Set(['c:health']))) return 'Health';
  if (within(FITNESS)) return has('c:health') ? 'Health & Fitness' : 'Fitness';
  if (within(new Set(['donations']))) return 'Giving';
  if (within(LEISURE)) return has('donations') ? 'Lifestyle & Giving' : 'Leisure';
  if (within(new Set(['c:health', 'c:vehicle', 'c:home']))) return 'Cover & Upkeep';
  if (lines.every((l) => !(l.typeSlug && isEssential({ slug: l.typeSlug }))))
    return 'Everything Else';
  return 'Household Bills';
}
