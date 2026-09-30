import { describe, expect, it } from 'vitest';
import { pageParam, paginate, paginateGroups } from '@/lib/paging';

describe('paging', () => {
  it('reads a page number, else the first page', () => {
    expect(pageParam('3')).toBe(3);
    expect(pageParam(undefined)).toBe(1);
    expect(pageParam('0')).toBe(1);
    expect(pageParam('two')).toBe(1);
  });

  it('cuts a list by count and clamps the page', () => {
    const items = Array.from({ length: 25 }, (_, i) => i);
    expect(paginate(items, 1, 12)).toMatchObject({ page: 1, pages: 3, items: items.slice(0, 12) });
    expect(paginate(items, 3, 12).items).toEqual([24]);
    expect(paginate(items, 9, 12).page).toBe(3);
    expect(paginate([], 1, 12)).toEqual({ items: [], page: 1, pages: 1 });
  });

  it('keeps each group whole', () => {
    // Months of 20, 15, 40 and 5 bills, about 30 a page.
    const months = [20, 15, 40, 5];
    const p1 = paginateGroups(months, (n) => n, 1, 30);
    expect(p1).toMatchObject({ items: [20, 15], pages: 3 });
    expect(paginateGroups(months, (n) => n, 2, 30).items).toEqual([40]);
    expect(paginateGroups(months, (n) => n, 3, 30).items).toEqual([5]);
    expect(paginateGroups([], (n: number) => n, 1, 30)).toEqual({ items: [], page: 1, pages: 1 });
  });
});
