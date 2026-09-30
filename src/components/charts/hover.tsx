'use client';

import { useEffect } from 'react';

/**
 * One hover layer for every chart on the page (BRAND.md §8): a crosshair and
 * tooltip on a trend (nearest point in the data-series JSON), a tooltip on
 * any bar or segment with data-tip. Mounted once from the root layout; the
 * charts themselves are plain server-rendered SVG.
 */
interface SeriesPoint {
  x: number;
  y: number;
  t: string;
}

function clear(fig: Element) {
  fig.classList.remove('hovering');
  for (const el of fig.querySelectorAll<HTMLElement>('.chart-cross,.chart-hover-pt,.chart-tip'))
    el.hidden = true;
}

function onMove(e: PointerEvent) {
  const target = e.target as Element | null;
  const fig = target?.closest?.('.chart');
  for (const c of document.querySelectorAll('.chart.hovering')) if (c !== fig) clear(c);
  if (!fig) return;
  const plot = fig.querySelector<HTMLElement>('.chart-plot');
  const tip = plot?.querySelector<HTMLElement>('.chart-tip');
  if (!plot || !tip) return;
  const r = plot.getBoundingClientRect();
  const series = (fig as HTMLElement).dataset.series;
  if (series) {
    const s = JSON.parse(series) as SeriesPoint[];
    if (s.length === 0) return;
    const px = ((e.clientX - r.left) / r.width) * 100;
    let best = 0;
    s.forEach((p, i) => {
      if (Math.abs(p.x - px) < Math.abs(s[best]!.x - px)) best = i;
    });
    const p = s[best]!;
    const cross = plot.querySelector<HTMLElement>('.chart-cross');
    const dot = plot.querySelector<HTMLElement>('.chart-hover-pt');
    if (!cross || !dot) return;
    cross.hidden = dot.hidden = tip.hidden = false;
    cross.style.left = dot.style.left = `${p.x}%`;
    dot.style.top = `${p.y}%`;
    tip.textContent = p.t;
    tip.style.left = `${Math.min(Math.max(p.x, 14), 86)}%`;
    tip.style.top = `${p.y}%`;
    fig.classList.add('hovering');
    return;
  }
  const bar = target?.closest<HTMLElement>('[data-tip]');
  if (bar && fig.contains(bar)) {
    const br = bar.getBoundingClientRect();
    tip.hidden = false;
    tip.textContent = bar.dataset.tip ?? '';
    tip.style.left = `${Math.min(Math.max(((br.left + br.width / 2 - r.left) / r.width) * 100, 16), 84)}%`;
    tip.style.top = `${((br.top - r.top) / r.height) * 100}%`;
    fig.classList.add('hovering');
  } else clear(fig);
}

export function ChartHover() {
  useEffect(() => {
    const leave = () => {
      for (const c of document.querySelectorAll('.chart.hovering')) clear(c);
    };
    document.addEventListener('pointermove', onMove, { passive: true });
    document.addEventListener('pointerleave', leave);
    return () => {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerleave', leave);
    };
  }, []);
  return null;
}
