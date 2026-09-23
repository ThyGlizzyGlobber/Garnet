'use client';

import { Area, AreaChart, ResponsiveContainer } from 'recharts';
import { seriesColour, useDarkMode } from './theme';

/** Tiny trend line with no axes, for stat tiles and the wall. */
export function Sparkline({
  values,
  colour = '#2a78d6',
  height = 40,
}: {
  values: number[];
  colour?: string;
  height?: number;
}) {
  const dark = useDarkMode();
  const c = seriesColour(colour, dark);
  const data = values.map((v, i) => ({ i, v }));
  return (
    <div style={{ width: '100%', height }} aria-hidden>
      <ResponsiveContainer>
        <AreaChart data={data} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
          <Area
            type="monotone"
            dataKey="v"
            stroke={c}
            strokeWidth={2}
            fill={c}
            fillOpacity={0.12}
            isAnimationActive={false}
            dot={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
