import { useId } from 'react';
import { colourCss } from '@/lib/palette';
import { niceTicks, smoothPath, spread } from './math';

export interface TrendPoint {
  key: string;
  label: string;
  value: number;
  /** The value formatted, for the callout and tooltip. */
  text: string;
  /** Optional second line for the tooltip (e.g. the service breakdown). */
  detail?: string;
}

/**
 * Trend: one smooth line with a gradient area, a fitted axis, a callout on
 * the latest value and (with hover.tsx) a crosshair tooltip. Plain SVG drawn
 * on the server; never a dual axis.
 */
export function TrendLine({
  points,
  colour = 'var(--p-accent)',
  height,
  label,
  axisFormat,
  ticks: tickCount = 3,
  axis = true,
  xLabels = true,
  every = 1,
  dots = false,
  callout = true,
  className,
}: {
  points: TrendPoint[];
  /** A stored service colour, or any CSS colour; the accent by default. */
  colour?: string;
  /** Fixed height in px; otherwise it fills its parent. */
  height?: number;
  /** Accessible name for the chart. */
  label: string;
  /** Formats an axis tick ("$1.2k"); the raw number by default. */
  axisFormat?: (v: number) => string;
  ticks?: number;
  axis?: boolean;
  xLabels?: boolean;
  /** Show every nth x label. */
  every?: number;
  /** A dot on every point, not only the last. */
  dots?: boolean;
  callout?: boolean;
  className?: string;
  id?: string;
}) {
  const gid = useId();
  const c = colourCss(colour);
  if (points.length < 2)
    return (
      <figure
        className={className ? `chart ${className}` : 'chart'}
        style={{ height }}
        aria-label={label}
      />
    );
  const vals = points.map((p) => p.value);
  let min = Math.min(...vals);
  let max = Math.max(...vals);
  const pad = (max - min) * 0.35 || Math.abs(max) * 0.1 || 1;
  const tickVals = niceTicks(min - pad, max + pad * 0.6, tickCount);
  min = tickVals[0]!;
  max = tickVals[tickVals.length - 1]!;
  const y = (v: number) => 100 - ((v - min) / (max - min || 1)) * 100;
  const pts = spread(vals, y);
  const line = smoothPath(pts);
  const last = pts[pts.length - 1]!;
  const lastP = points[points.length - 1]!;
  const fmt = axisFormat ?? ((v: number) => String(v));
  const series = JSON.stringify(
    points.map((p, i) => ({
      x: pts[i]![0],
      y: pts[i]![1],
      t: p.detail ? `${p.label} · ${p.text} · ${p.detail}` : `${p.label} · ${p.text}`,
    })),
  );
  const cls = ['chart', 'chart-trend', axis && 'has-axis', xLabels && 'has-x', className]
    .filter(Boolean)
    .join(' ');
  return (
    <figure
      className={cls}
      style={{ ['--c' as string]: c, height }}
      data-series={series}
      aria-label={label}
    >
      {axis && (
        <div className="chart-y" aria-hidden="true">
          {tickVals.map((t) => (
            <span key={t} style={{ top: `${y(t)}%` }}>
              {fmt(t)}
            </span>
          ))}
        </div>
      )}
      <div className="chart-plot">
        {axis &&
          tickVals.map((t) => <i key={t} className="chart-grid" style={{ top: `${y(t)}%` }} />)}
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          <defs>
            <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor={c} stopOpacity={0.34} />
              <stop offset="1" stopColor={c} stopOpacity={0} />
            </linearGradient>
          </defs>
          <path d={`${line} L100,100 L0,100 Z`} fill={`url(#${gid})`} />
          <path
            className="chart-line"
            d={line}
            fill="none"
            stroke={c}
            strokeWidth={2}
            vectorEffect="non-scaling-stroke"
            strokeLinecap="round"
          />
        </svg>
        {dots &&
          pts
            .slice(0, -1)
            .map((p, i) => (
              <i
                key={points[i]!.key}
                className="chart-pt"
                style={{ left: `${p[0]}%`, top: `${p[1]}%` }}
              />
            ))}
        <i className="chart-pt last" style={{ left: `${last[0]}%`, top: `${last[1]}%` }} />
        {callout && (
          <span className="chart-callout" style={{ left: `${last[0]}%`, top: `${last[1]}%` }}>
            {lastP.text}
          </span>
        )}
        <i className="chart-cross" hidden />
        <i className="chart-hover-pt" hidden />
        <span className="chart-tip" hidden />
      </div>
      {xLabels && (
        <div className="chart-x" aria-hidden="true">
          {points.map((p, i) => (
            <span key={p.key} style={{ left: `${pts[i]![0]}%` }}>
              {i % every === 0 || i === points.length - 1 ? p.label : ''}
            </span>
          ))}
        </div>
      )}
    </figure>
  );
}
