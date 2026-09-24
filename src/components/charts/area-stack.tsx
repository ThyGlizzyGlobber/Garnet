'use client';

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { chartInk, seriesColour, useDarkMode } from './theme';

export interface AreaSeries {
  id: string;
  name: string;
  colour: string;
}

export interface AreaRow {
  month: string;
  label: string;
  total: number;
  [serviceId: string]: number | string;
}

/** Stacked, smoothed area chart with gradient fills and a glowing total line. */
export function AreaStack({
  rows,
  series,
  format,
  height = 250,
}: {
  rows: AreaRow[];
  series: AreaSeries[];
  format: Record<string, string>;
  height?: number;
}) {
  const dark = useDarkMode();
  return (
    <div style={{ width: '100%', height }} role="img" aria-label="Monthly cost per service">
      <ResponsiveContainer>
        <AreaChart data={rows} margin={{ top: 12, right: 8, left: 4, bottom: 0 }}>
          <defs>
            {series.map((s) => {
              const c = seriesColour(s.colour, dark);
              return (
                <linearGradient key={s.id} id={`area-${s.id}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={c} stopOpacity={0.55} />
                  <stop offset="100%" stopColor={c} stopOpacity={0.08} />
                </linearGradient>
              );
            })}
            <filter id="area-glow" x="-10%" y="-10%" width="120%" height="120%">
              <feGaussianBlur stdDeviation="2.5" result="b" />
              <feMerge>
                <feMergeNode in="b" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          <CartesianGrid vertical={false} stroke={chartInk.grid} />
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
            cursor={{ stroke: chartInk.axis, strokeDasharray: '3 3' }}
            contentStyle={{
              background: chartInk.tooltipBg,
              border: `1px solid ${chartInk.tooltipBorder}`,
              borderRadius: 14,
              fontSize: 12,
              color: 'var(--color-fg)',
              boxShadow: '0 12px 32px rgba(0,0,0,0.25)',
            }}
            labelStyle={{ color: 'var(--color-fg-muted)', marginBottom: 4 }}
            itemStyle={{ color: 'var(--color-fg)' }}
            formatter={(_v, name, item) => {
              const row = item.payload as AreaRow;
              return [format[`${row.month}:${String(item.dataKey)}`] ?? '', name];
            }}
            labelFormatter={(label, payload) => {
              const row = payload?.[0]?.payload as AreaRow | undefined;
              return row ? `${label} · ${format[`${row.month}:total`] ?? ''}` : label;
            }}
          />
          {series.map((s, i) => (
            <Area
              key={s.id}
              type="monotone"
              dataKey={s.id}
              name={s.name}
              stackId="cost"
              stroke={seriesColour(s.colour, dark)}
              strokeWidth={i === series.length - 1 ? 2.5 : 1.25}
              fill={`url(#area-${s.id})`}
              dot={false}
              activeDot={{ r: 5, strokeWidth: 2, stroke: 'var(--color-surface-solid)' }}
              isAnimationActive={false}
              filter={i === series.length - 1 ? 'url(#area-glow)' : undefined}
            />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
