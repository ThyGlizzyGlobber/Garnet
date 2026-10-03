import type { ReactNode } from 'react';
import type { HomeData } from '@/lib/home-data';
import type { Fmt } from './fmt';
import { WIDGETS, serviceWidget } from './widgets';

/**
 * The widget catalogue (SCOPE-widgets.md): every widget comes in the three
 * sizes and draws from the same plain Home data. The widgets themselves are
 * in widgets.tsx, the pieces they are drawn from in pieces.tsx.
 */
type T = (key: string, values?: Record<string, string | number | Date>) => string;

export interface WidgetCtx {
  d: HomeData;
  w: number;
  h: number;
  cols: number;
  t: T;
  f: Fmt;
  /** Marks the viewer's share paid (Next due). */
  onMarkPaid?: (shareId: string, billId: string) => void;
}

export interface WidgetDef {
  id: string;
  icon: string;
  sizes: [number, number][];
  render: (c: WidgetCtx) => ReactNode;
}

/** The whole catalogue for a household: the twenty plus one per service. */
export function catalogFor(d: HomeData): WidgetDef[] {
  return [...WIDGETS, ...d.services.map(serviceWidget)];
}

/** Widgets that still say something before the first bill. */
export const ALWAYS = new Set(['weather', 'start', 'actions', 'postcode']);

/** Widgets that leave the Add list while they have nothing to show (SCOPE-widgets.md Q7). */
export const WHEN_NEEDED = new Set(['notices', 'plan', 'season']);
