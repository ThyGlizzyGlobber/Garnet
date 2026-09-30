import { useId } from 'react';
import { colourCss } from '@/lib/palette';
import { smoothPath, spread } from './math';

/**
 * Sparkline: a soft area, a 2 px line and an end dot, filling its box; no
 * axes. Plain SVG drawn on the server.
 */
export function Sparkline({
  values,
  colour = 'var(--p-accent)',
  height,
  className,
}: {
  values: number[];
  /** A stored service colour, or any CSS colour; the accent by default. */
  colour?: string;
  /** Fixed height in px; otherwise it fills its parent. */
  height?: number;
  className?: string;
  /** Kept for the screens that still pass one; gradients get their own ids now. */
  id?: string;
}) {
  const gid = useId();
  const c = colourCss(colour);
  if (values.length < 2) return <div className={className} style={{ height }} aria-hidden="true" />;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  // A flat line sits mid-height rather than at the bottom.
  const flat = max - min < Math.abs(max) * 0.002;
  const pts = spread(values, (v) => (flat ? 55 : 92 - ((v - min) / span) * 78));
  const line = smoothPath(pts);
  const last = pts[pts.length - 1]!;
  return (
    <div
      className={className ? `spark ${className}` : 'spark'}
      style={{ ['--c' as string]: c, height }}
      aria-hidden="true"
    >
      <svg viewBox="0 0 100 100" preserveAspectRatio="none">
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={c} stopOpacity={0.32} />
            <stop offset="1" stopColor={c} stopOpacity={0} />
          </linearGradient>
        </defs>
        <path d={`${line} L100,100 L0,100 Z`} fill={`url(#${gid})`} />
        <path
          d={line}
          fill="none"
          stroke={c}
          strokeWidth={2}
          vectorEffect="non-scaling-stroke"
          strokeLinecap="round"
        />
      </svg>
      <i className="spark-dot" style={{ left: `${last[0]}%`, top: `${last[1]}%` }} />
    </div>
  );
}
