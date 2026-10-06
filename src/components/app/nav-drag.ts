import type { DragEvent } from 'react';

/**
 * While a service is dragged in the Arrange card: near the top or bottom of
 * the services list, scroll it, so a service can be taken anywhere in a
 * long list.
 */
export function dragScroll(e: DragEvent) {
  const list = (e.currentTarget as HTMLElement).closest('.nc-svcs');
  if (!list) return;
  const r = list.getBoundingClientRect();
  const edge = 48;
  if (e.clientY < r.top + edge) list.scrollBy(0, -Math.ceil((r.top + edge - e.clientY) / 4));
  else if (e.clientY > r.bottom - edge)
    list.scrollBy(0, Math.ceil((e.clientY - (r.bottom - edge)) / 4));
}

/** Where a drop line goes over an element: its lower half means after it. */
export function lowerHalf(e: DragEvent): boolean {
  const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
  return e.clientY > r.top + r.height / 2;
}
