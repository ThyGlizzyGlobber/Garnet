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
 * Last comes My Services, the person's own: always there, never renamed,
 * only its order theirs to change.
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
  /** My Services, the person's own, in their order: last. */
  mine: string[];
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

/** My Services in the person's order; any not placed yet last, in list order. */
export function orderMine<E>(entries: E[], keyOf: (e: E) => string, layout: NavLayout | null): E[] {
  const at = new Map((layout?.mine ?? []).map((k, i) => [k, i]));
  return entries
    .map((e, i) => ({ e, i, at: at.get(keyOf(e)) ?? Infinity }))
    .sort((a, b) => a.at - b.at || a.i - b.i)
    .map((x) => x.e);
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
  const o = v as { loose?: unknown; groups?: unknown; mine?: unknown };
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
  const groups = o.groups
    .filter((g): g is Record<string, unknown> => !!g && typeof g === 'object')
    .slice(0, MAX_GROUPS)
    .map((g, i) => ({
      id: typeof g.id === 'string' && /^[\w-]{1,32}$/.test(g.id) ? g.id : `g${i + 1}`,
      name: typeof g.name === 'string' ? g.name.trim().slice(0, MAX_NAME) : '',
      items: unique(keys(g.items)),
    }));
  const ids = new Set<string>();
  for (const g of groups) {
    if (ids.has(g.id)) g.id = `${g.id}-${ids.size}`;
    ids.add(g.id);
  }
  return { loose: unique(keys(o.loose)), groups, mine: unique(keys(o.mine, true)) };
}

const ENERGY = new Set(['electricity', 'gas']);
const UTILITIES = new Set(['electricity', 'gas', 'water', 'internet', 'phone']);
const CONNECTED = new Set(['internet', 'phone']);
const HOME = new Set(['rent', 'c:home']);
const LEISURE = new Set(['subscriptions', 'c:lifestyle', 'donations']);

/**
 * A name to offer for a group, from what's in it: the everyday bills are
 * "Essentials", electricity and gas "Energy", Subscriptions and Lifestyle
 * "Leisure"… Shown as "e.g. …" while
 * the name is empty, and used when it's left empty.
 */
export function suggestGroupName(lines: NavLine[]): string {
  if (!lines.length) return 'Household Bills';
  const kinds = lines.map((l) => (l.category ? `c:${l.category}` : (l.typeSlug ?? '')));
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
  if (within(new Set(['donations']))) return 'Giving';
  if (within(LEISURE)) return has('donations') ? 'Lifestyle & Giving' : 'Leisure';
  if (within(new Set(['c:health', 'c:vehicle', 'c:home']))) return 'Cover & Upkeep';
  if (lines.every((l) => !(l.typeSlug && isEssential({ slug: l.typeSlug }))))
    return 'Everything Else';
  return 'Household Bills';
}
