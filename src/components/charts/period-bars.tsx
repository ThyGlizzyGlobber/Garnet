import Link from 'next/link';
import { colourCss } from '@/lib/palette';

export interface PeriodBar {
  /** YYYY-MM-DD, the bill's period. */
  from: string;
  to: string;
  /** Height: the value per day. */
  value: number;
  /** Under the bar; leave blank for short periods. */
  label?: string;
  tip: string;
  href?: string;
  /** An estimate (hatched). */
  est?: boolean;
  /** Marked unusual (a warning ring). */
  flag?: boolean;
}

const DAY = 86_400_000;

/**
 * Bars that span each bill's period on a time axis, height = value per day
 * (usage or cost), with the year lines and an optional reference line (a
 * limit). Each bar links to its bill.
 */
export function PeriodBars({
  bars,
  colour = 'var(--p-accent)',
  label,
  reference,
  className,
}: {
  bars: PeriodBar[];
  colour?: string;
  /** Accessible name for the chart. */
  label: string;
  reference?: { value: number; label: string };
  className?: string;
}) {
  const c = colourCss(colour);
  if (bars.length === 0)
    return (
      <figure
        className={className ? `chart chart-bars ${className}` : 'chart chart-bars'}
        aria-label={label}
      />
    );
  const t0 = Date.parse(bars[0]!.from);
  const t1 = Date.parse(bars[bars.length - 1]!.to) + DAY;
  const x = (s: string) => ((Date.parse(s) - t0) / (t1 - t0)) * 100;
  const dayW = (100 * DAY) / (t1 - t0);
  const top = Math.max(...bars.map((b) => b.value), reference?.value ?? 0) * 1.18 || 1;
  const h = (v: number) => (v / top) * 100;
  const years: number[] = [];
  for (let yr = new Date(t0).getUTCFullYear() + 1; Date.parse(`${yr}-01-01`) < t1; yr++)
    years.push(yr);
  return (
    <figure
      className={className ? `chart chart-bars ${className}` : 'chart chart-bars'}
      style={{ ['--c' as string]: c }}
      aria-label={label}
    >
      <div className="chart-plot">
        <i className="chart-grid" style={{ top: '100%' }} />
        {years.map((y) => (
          <i key={y} className="chart-year" style={{ left: `${x(`${y}-01-01`)}%` }}>
            <span>{y}</span>
          </i>
        ))}
        {bars.map((b) => {
          const cls = ['pbar', b.est && 'est', b.flag && 'flag'].filter(Boolean).join(' ');
          const style = {
            left: `calc(${x(b.from)}% + 1px)`,
            width: `calc(${x(b.to) - x(b.from) + dayW}% - 2px)`,
            height: `${h(b.value)}%`,
          };
          return b.href ? (
            <Link
              key={b.from}
              href={b.href}
              className={cls}
              data-tip={b.tip}
              style={style}
              aria-label={b.tip}
            />
          ) : (
            <span
              key={b.from}
              className={cls}
              data-tip={b.tip}
              style={style}
              role="img"
              aria-label={b.tip}
            />
          );
        })}
        {reference && (
          <i className="chart-ref" style={{ bottom: `${h(reference.value)}%` }}>
            <span>{reference.label}</span>
          </i>
        )}
        <span className="chart-tip" hidden />
      </div>
      <div className="chart-x" aria-hidden="true">
        {bars.map((b) => (
          <span key={b.from} style={{ left: `${(x(b.from) + x(b.to)) / 2}%` }}>
            {b.label ?? ''}
          </span>
        ))}
      </div>
    </figure>
  );
}
