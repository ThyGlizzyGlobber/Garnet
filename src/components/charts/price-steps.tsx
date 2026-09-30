import Link from 'next/link';
import { colourCss } from '@/lib/palette';

export interface PricePoint {
  /** Under the point: the month (or blank). */
  label: string;
  value: number;
  /** Shown above the point where the price is new (the first, and each change). */
  price?: string;
  tip: string;
  href?: string;
  state: 'paid' | 'due' | 'overdue' | 'upcoming';
}

/**
 * A fixed price over time (internet, a subscription): one point per bill on a
 * step line, drawn on a scale that fits the prices it has had, so a $85 →
 * $89 rise is plain to see and an unchanged price is a flat line. Each point
 * says whether that bill is paid; the next expected charge is hollow.
 */
export function PriceSteps({
  points,
  colour = 'var(--p-accent)',
  label,
}: {
  points: PricePoint[];
  colour?: string;
  /** Accessible name for the chart. */
  label: string;
}) {
  const n = points.length;
  const values = points.map((p) => p.value);
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const x = (i: number) => ((i + 0.5) / n) * 100;
  // Bottom-up percentages: a flat price in the middle, changes between 22% and 74%.
  const y = (v: number) => (hi === lo ? 48 : 22 + ((v - lo) / (hi - lo)) * 52);
  const path = points
    .map((p, i) =>
      i === 0
        ? `M 0 ${100 - y(p.value)} H ${x(0)}`
        : `H ${(x(i - 1) + x(i)) / 2} V ${100 - y(p.value)} H ${x(i)}`,
    )
    .join(' ');
  const lastFirm = points.findLastIndex((p) => p.state !== 'upcoming');
  return (
    <figure
      className="chart chart-price"
      style={{ ['--c' as string]: colourCss(colour) }}
      aria-label={label}
    >
      <div className="chart-plot">
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          <path d={`${path} H 100`} className="ps-line" vectorEffect="non-scaling-stroke" />
          {lastFirm >= 0 && lastFirm < n - 1 && (
            <path
              d={`M ${x(lastFirm)} ${100 - y(points[lastFirm]!.value)} ${points
                .slice(lastFirm + 1)
                .map(
                  (p, k) =>
                    `H ${(x(lastFirm + k) + x(lastFirm + k + 1)) / 2} V ${100 - y(p.value)} H ${x(lastFirm + k + 1)}`,
                )
                .join(' ')}`}
              className="ps-line ps-ahead"
              vectorEffect="non-scaling-stroke"
            />
          )}
        </svg>
        {points.map((p, i) => {
          const style = { left: `${x(i)}%`, bottom: `${y(p.value)}%` };
          return (
            <span key={i}>
              {p.price && (
                <span className="ps-price" style={style}>
                  {p.price}
                </span>
              )}
              {p.href ? (
                <Link
                  href={p.href}
                  className={`ps-pt s-${p.state}`}
                  style={style}
                  data-tip={p.tip}
                  aria-label={p.tip}
                />
              ) : (
                <span
                  className={`ps-pt s-${p.state}`}
                  style={style}
                  data-tip={p.tip}
                  role="img"
                  aria-label={p.tip}
                />
              )}
            </span>
          );
        })}
        <span className="chart-tip" hidden />
      </div>
      <div className="chart-x ps-x" aria-hidden="true">
        {points.map((p, i) => (
          <span key={i} style={{ left: `${x(i)}%` }}>
            {p.label}
          </span>
        ))}
      </div>
    </figure>
  );
}
