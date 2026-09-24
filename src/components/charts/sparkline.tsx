'use client';

import { Area, AreaChart, ReferenceDot, ResponsiveContainer } from 'recharts';
import { seriesColour, useDarkMode } from './theme';

/** Tiny smooth trend with a soft area, a glow and an end dot. No axes. */
export function Sparkline({
  values,
  colour = '#5b6f82',
  height = 40,
  id = 'spark',
}: {
  values: number[];
  colour?: string;
  height?: number;
  id?: string;
}) {
  const dark = useDarkMode();
  const c = seriesColour(colour, dark);
  const data = values.map((v, i) => ({ i, v }));
  const last = data[data.length - 1];
  return (
    <div style={{ width: '100%', height }} aria-hidden>
      <ResponsiveContainer>
        <AreaChart data={data} margin={{ top: 6, right: 8, left: 0, bottom: 2 }}>
          <defs>
            <linearGradient id={`${id}-fill`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={c} stopOpacity={0.4} />
              <stop offset="100%" stopColor={c} stopOpacity={0} />
            </linearGradient>
          </defs>
          <Area
            type="monotone"
            dataKey="v"
            stroke={c}
            strokeWidth={2}
            fill={`url(#${id}-fill)`}
            isAnimationActive={false}
            dot={false}
          />
          {last && (
            <ReferenceDot
              x={last.i}
              y={last.v}
              r={3.5}
              fill={c}
              stroke="var(--color-surface-solid)"
              strokeWidth={1.5}
              ifOverflow="visible"
            />
          )}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
