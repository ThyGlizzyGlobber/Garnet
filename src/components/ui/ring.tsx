import { useId, type ReactNode } from 'react';
import { cx } from './cx';

/**
 * The ring and the arc (BRAND.md §8): a gradient stroke from the accent to
 * accent 2 (or one colour) with a soft glow, on a quiet track. Plain SVG,
 * drawn on the server; `pct` is 0–100 and the centre holds the figure.
 */

/** Tick marks around the ring; drawn always, shown when --ticks is above 0 (not in Frost Glass). */
function ticks() {
  return Array.from({ length: 48 }, (_, i) => {
    const a = (i / 48) * Math.PI * 2 - Math.PI / 2;
    const r1 = 49;
    const r2 = i % 4 === 0 ? 46 : 47.2;
    return (
      <line
        key={i}
        x1={(50 + r1 * Math.cos(a)).toFixed(2)}
        y1={(50 + r1 * Math.sin(a)).toFixed(2)}
        x2={(50 + r2 * Math.cos(a)).toFixed(2)}
        y2={(50 + r2 * Math.sin(a)).toFixed(2)}
      />
    );
  });
}

export function Ring({
  pct,
  size = 120,
  stroke,
  from = 'var(--p-accent)',
  to,
  className,
  children,
}: {
  pct: number;
  /** Diameter in px (the centre's figure scales with it). */
  size?: number;
  /** Stroke width in px; the pack's ring width by default. */
  stroke?: number;
  from?: string;
  /** The gradient's end; accent 2 by default, or `from` again for one colour. */
  to?: string;
  className?: string;
  children?: ReactNode;
  /** Kept for the screens that still pass one; gradients get their own ids now. */
  id?: string;
}) {
  const gid = useId();
  const r = 42;
  const c = 2 * Math.PI * r;
  const f = Math.max(0, Math.min(100, pct)) / 100;
  const sw = stroke ? `${(stroke * 100) / size}` : 'var(--ring-w)';
  const colB = to ?? (from === 'var(--p-accent)' ? 'var(--p-accent2)' : from);
  return (
    <div className={cx('gauge', className)} style={{ ['--size' as string]: `${size}px` }}>
      <svg viewBox="0 0 100 100" aria-hidden="true">
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor={from} />
            <stop offset="1" stopColor={colB} />
          </linearGradient>
        </defs>
        <g className="gauge-ticks">{ticks()}</g>
        <circle
          className="gauge-track"
          cx="50"
          cy="50"
          r={r}
          fill="none"
          style={{ strokeWidth: sw }}
        />
        <circle
          className="gauge-arc"
          cx="50"
          cy="50"
          r={r}
          fill="none"
          stroke={`url(#${gid})`}
          strokeLinecap="round"
          strokeDasharray={`${(c * f).toFixed(2)} ${c.toFixed(2)}`}
          transform="rotate(-90 50 50)"
          style={{ strokeWidth: sw, ['--glowc' as string]: from }}
        />
      </svg>
      <div className="gauge-in">{children}</div>
    </div>
  );
}

/** A half gauge with an end cap; `mark` (0–100) draws a small line at a limit. */
export function Arc({
  pct,
  width = 190,
  from = 'var(--p-accent)',
  to,
  mark,
  className,
  children,
}: {
  pct: number;
  /** The widest it grows, in px. */
  width?: number;
  from?: string;
  to?: string;
  mark?: number;
  className?: string;
  children?: ReactNode;
  id?: string;
  stroke?: number;
}) {
  const gid = useId();
  const f = Math.max(0, Math.min(100, pct)) / 100;
  const a = Math.PI * (1 - f);
  const capX = 50 + 40 * Math.cos(a);
  const capY = 50 - 40 * Math.sin(a);
  const colB = to ?? (from === 'var(--p-accent)' ? 'var(--p-accent2)' : from);
  const m = mark == null ? null : Math.PI * (1 - Math.max(0, Math.min(100, mark)) / 100);
  return (
    <div className={cx('arc', className)} style={{ maxWidth: width }}>
      <svg viewBox="0 0 100 56" aria-hidden="true">
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor={from} />
            <stop offset="1" stopColor={colB} />
          </linearGradient>
        </defs>
        <path
          className="arc-track"
          d="M10 50 A40 40 0 0 1 90 50"
          fill="none"
          strokeLinecap="round"
        />
        <path
          className="arc-val"
          d="M10 50 A40 40 0 0 1 90 50"
          fill="none"
          stroke={`url(#${gid})`}
          strokeLinecap="round"
          pathLength={100}
          strokeDasharray={`${(f * 100).toFixed(1)} 100`}
          style={{ ['--glowc' as string]: from }}
        />
        {m != null && (
          <line
            className="arc-mark"
            x1={(50 + 33 * Math.cos(m)).toFixed(2)}
            y1={(50 - 33 * Math.sin(m)).toFixed(2)}
            x2={(50 + 47 * Math.cos(m)).toFixed(2)}
            y2={(50 - 47 * Math.sin(m)).toFixed(2)}
          />
        )}
        <circle
          className="arc-cap"
          cx={capX.toFixed(2)}
          cy={capY.toFixed(2)}
          r="4.2"
          style={{ fill: colB }}
        />
      </svg>
      {children && <div className="arc-in">{children}</div>}
    </div>
  );
}
