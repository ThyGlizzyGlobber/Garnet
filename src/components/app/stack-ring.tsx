import type { ReactNode } from 'react';

/**
 * The menu's month ring (SCOPE-shell.md §3b): a thin ring, filled to the
 * share of this month's bills paid, with a figure or a tick in the middle.
 * Plain SVG, so it draws on the server and in the switcher alike.
 */
export function StackRing({
  pct,
  label,
  className,
  children,
}: {
  /** 0 to 1. */
  pct: number;
  /** What the ring says, for screen readers. */
  label: string;
  className?: string;
  children?: ReactNode;
}) {
  const r = 42;
  const c = 2 * Math.PI * r;
  const f = Math.max(0, Math.min(1, pct));
  return (
    <span className={className ?? 'st-ring'} role="img" aria-label={label}>
      <svg viewBox="0 0 100 100" aria-hidden="true">
        <circle cx="50" cy="50" r={r} className="st-ring-track" />
        {f > 0 && (
          <circle
            cx="50"
            cy="50"
            r={r}
            className="st-ring-fill"
            strokeDasharray={`${(c * f).toFixed(1)} ${c.toFixed(1)}`}
            transform="rotate(-90 50 50)"
          />
        )}
      </svg>
      <span aria-hidden="true">{children}</span>
    </span>
  );
}
