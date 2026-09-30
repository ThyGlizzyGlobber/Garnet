/**
 * Long lists in pages: a page number from the address, and lists cut into
 * pages either by count or by whole groups (a month's bills are never split
 * across pages, so its heading and total stay right).
 */

/** "3" → 3; anything else → 1. Clamped to the pages there are by the callers. */
export function pageParam(raw: string | undefined): number {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : 1;
}

export interface Paged<T> {
  items: T[];
  /** 1-based, clamped to [1, pages]. */
  page: number;
  pages: number;
}

/** Items `size` at a time. */
export function paginate<T>(items: T[], page: number, size: number): Paged<T> {
  const pages = Math.max(1, Math.ceil(items.length / size));
  const p = Math.min(Math.max(1, page), pages);
  return { items: items.slice((p - 1) * size, p * size), page: p, pages };
}

/**
 * Whole groups at a time: a page takes groups until it holds at least `size`
 * items, so a page may run over but a group is never cut in two.
 */
export function paginateGroups<G>(
  groups: G[],
  count: (g: G) => number,
  page: number,
  size: number,
): Paged<G> {
  const all: G[][] = [];
  let current: G[] = [];
  let n = 0;
  for (const g of groups) {
    current.push(g);
    n += count(g);
    if (n >= size) {
      all.push(current);
      current = [];
      n = 0;
    }
  }
  if (current.length || !all.length) all.push(current);
  const p = Math.min(Math.max(1, page), all.length);
  return { items: all[p - 1]!, page: p, pages: all.length };
}
