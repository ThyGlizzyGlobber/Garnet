'use client';

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { chartInk, seriesColour, useDarkMode } from './theme';

export interface MonthlyBarsSeries {
  id: string;
  name: string;
  colour: string;
}

export interface MonthlyBarsRow {
  month: string;
  label: string;
  total: number;
  [serviceId: string]: number | string;
}

/**
 * Stacked monthly cost per service. Values are major units (already divided) so
 * the axis reads naturally; the tooltip shows pre-formatted strings from the server.
 */
export function MonthlyBars({
  rows,
  series,
  format,
  height = 240,
}: {
  rows: MonthlyBarsRow[];
  series: MonthlyBarsSeries[];
  /** Preformatted money per row per series and total, keyed `${month}:${id}` and `${month}:total`. */
  format: Record<string, string>;
  height?: number;
}) {
  const dark = useDarkMode();
  return (
    <div style={{ width: '100%', height }} role="img" aria-label="Monthly cost per service">
      <ResponsiveContainer>
        <BarChart
          data={rows}
          margin={{ top: 8, right: 4, left: 4, bottom: 0 }}
          barCategoryGap="28%"
        >
          <CartesianGrid vertical={false} stroke={chartInk.grid} strokeDasharray="0" />
          <XAxis
            dataKey="label"
            tick={{ fill: chartInk.axis, fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            interval="preserveStartEnd"
          />
          <YAxis
            tick={{ fill: chartInk.axis, fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            width={44}
            tickFormatter={(v: number) =>
              v >= 1000 ? `${(v / 1000).toFixed(v % 1000 ? 1 : 0)}k` : String(v)
            }
          />
          <Tooltip
            cursor={{ fill: 'var(--color-surface-2)' }}
            contentStyle={{
              background: chartInk.tooltipBg,
              border: `1px solid ${chartInk.tooltipBorder}`,
              borderRadius: 12,
              fontSize: 12,
              color: 'var(--color-fg)',
            }}
            labelStyle={{ color: 'var(--color-fg-muted)' }}
            itemStyle={{ color: 'var(--color-fg)' }}
            formatter={(_v, name, item) => {
              const row = item.payload as MonthlyBarsRow;
              const key = `${row.month}:${String(item.dataKey)}`;
              return [format[key] ?? '', name];
            }}
            labelFormatter={(label, payload) => {
              const row = payload?.[0]?.payload as MonthlyBarsRow | undefined;
              return row ? `${label} · ${format[`${row.month}:total`] ?? ''}` : label;
            }}
          />
          {series.map((s, i) => (
            <Bar
              key={s.id}
              dataKey={s.id}
              name={s.name}
              stackId="cost"
              fill={seriesColour(s.colour, dark)}
              stroke="var(--color-surface-solid)"
              strokeWidth={1}
              radius={i === series.length - 1 ? [4, 4, 0, 0] : 0}
              isAnimationActive={false}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
