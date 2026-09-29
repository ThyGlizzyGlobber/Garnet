import { colourCss } from '@/lib/palette';

/**
 * Tiny smooth trend with a soft area and an end dot; no axes. Plain SVG drawn
 * on the server: the colour follows the light/dark scheme through CSS, so no
 * chart library or script is needed in the browser.
 */
export function Sparkline({
  values,
  colour = 'var(--color-accent)',
  height = 40,
  id,
}: {
  values: number[];
  /** A stored service colour, or any CSS colour; the accent by default. */
  colour?: string;
  height?: number;
  /** Gradient id; by default one per colour, so tiles never share another's fill. */
  id?: string;
}) {
  const c = colourCss(colour);
  const gid = id ?? `spark-${colour.replace(/[^a-z0-9]/gi, '')}`;
  // Drawn in a 100-wide box and stretched to the width; the dot is kept round below.
  const w = 100;
  const pad = { top: 6, bottom: 2, left: 0, right: 4 };
  const max = Math.max(...values, 0);
  const min = Math.min(...values, 0);
  const span = max - min || 1;
  const pts = values.map((v, i) => ({
    x: pad.left + (values.length > 1 ? (i / (values.length - 1)) * (w - pad.left - pad.right) : 0),
    y: pad.top + (1 - (v - min) / span) * (height - pad.top - pad.bottom),
  }));
  if (pts.length < 2) return <div style={{ height }} aria-hidden="true" />;
  // A smooth line through every point (Catmull-Rom as cubic Béziers).
  let line = `M${pts[0]!.x},${pts[0]!.y}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i]!;
    const p1 = pts[i]!;
    const p2 = pts[i + 1]!;
    const p3 = pts[i + 2] ?? p2;
    const c1 = { x: p1.x + (p2.x - p0.x) / 6, y: p1.y + (p2.y - p0.y) / 6 };
    const c2 = { x: p2.x - (p3.x - p1.x) / 6, y: p2.y - (p3.y - p1.y) / 6 };
    line += ` C${c1.x},${c1.y} ${c2.x},${c2.y} ${p2.x},${p2.y}`;
  }
  const last = pts[pts.length - 1]!;
  const area = `${line} L${last.x},${height} L${pts[0]!.x},${height} Z`;
  return (
    <div className="relative" style={{ height }} aria-hidden="true">
      <svg
        viewBox={`0 0 ${w} ${height}`}
        preserveAspectRatio="none"
        className="absolute inset-0 size-full overflow-visible"
      >
        <defs>
          <linearGradient id={`${gid}-fill`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" style={{ stopColor: c, stopOpacity: 0.4 }} />
            <stop offset="100%" style={{ stopColor: c, stopOpacity: 0 }} />
          </linearGradient>
        </defs>
        <path d={area} fill={`url(#${gid}-fill)`} />
        <path
          d={line}
          fill="none"
          style={{ stroke: c }}
          strokeWidth={2}
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <span
        className="absolute size-[7px] -translate-x-1/2 -translate-y-1/2 rounded-full border-[1.5px] border-surface-solid"
        style={{ left: `${last.x}%`, top: last.y, background: c }}
      />
    </div>
  );
}
