/**
 * Circular progress ring with a gradient stroke and a soft glow.
 * Server-safe SVG; `pct` 0–100. Children render in the centre.
 */
export function Ring({
  pct,
  size = 128,
  stroke = 12,
  from = 'var(--color-accent)',
  to = 'var(--color-accent-2)',
  track = 'var(--color-surface-2)',
  children,
  id,
}: {
  pct: number;
  size?: number;
  stroke?: number;
  from?: string;
  to?: string;
  track?: string;
  children?: React.ReactNode;
  id: string;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(100, pct));
  const dash = (clamped / 100) * c;
  return (
    <div className="relative grid place-items-center" style={{ width: size, height: size }}>
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        aria-hidden="true"
        className="-rotate-90"
      >
        <defs>
          <linearGradient id={`ring-${id}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor={from} />
            <stop offset="1" stopColor={to} />
          </linearGradient>
          <filter id={`glow-${id}`} x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="3" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={track} strokeWidth={stroke} />
        {clamped > 0 && (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={`url(#ring-${id})`}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={`${dash} ${c - dash}`}
            filter={`url(#glow-${id})`}
          />
        )}
      </svg>
      <div className="absolute inset-0 grid place-items-center">{children}</div>
    </div>
  );
}

/** Semicircular gauge, same styling. */
export function Arc({
  pct,
  width = 200,
  stroke = 14,
  from = 'var(--color-accent)',
  to = 'var(--color-accent-2)',
  id,
}: {
  pct: number;
  width?: number;
  stroke?: number;
  from?: string;
  to?: string;
  id: string;
}) {
  const r = (width - stroke) / 2;
  const cx = width / 2;
  const cy = width / 2;
  const clamped = Math.max(0, Math.min(100, pct));
  const a = Math.PI * (1 - clamped / 100);
  const x = cx + r * Math.cos(a);
  const y = cy - r * Math.sin(a);
  return (
    <svg
      width={width}
      height={width / 2 + stroke}
      viewBox={`0 0 ${width} ${width / 2 + stroke}`}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={`arc-${id}`} x1="0" x2="1">
          <stop offset="0" stopColor={from} />
          <stop offset="1" stopColor={to} />
        </linearGradient>
      </defs>
      <path
        d={`M${cx - r} ${cy} A${r} ${r} 0 0 1 ${cx + r} ${cy}`}
        fill="none"
        stroke="var(--color-surface-2)"
        strokeWidth={stroke}
        strokeLinecap="round"
      />
      {clamped > 0 && (
        <path
          d={`M${cx - r} ${cy} A${r} ${r} 0 ${clamped > 50 ? 1 : 0} 1 ${x.toFixed(1)} ${y.toFixed(1)}`}
          fill="none"
          stroke={`url(#arc-${id})`}
          strokeWidth={stroke}
          strokeLinecap="round"
        />
      )}
      {clamped > 0 && (
        <circle
          cx={x}
          cy={y}
          r={stroke / 2 + 2}
          fill="var(--color-surface-solid)"
          stroke={`url(#arc-${id})`}
          strokeWidth="3"
        />
      )}
    </svg>
  );
}
