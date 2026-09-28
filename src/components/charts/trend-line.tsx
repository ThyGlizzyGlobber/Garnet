'use client';

import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceDot,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { chartInk, seriesColour, useDarkMode } from './theme';

export interface TrendPoint {
  key: string;
  label: string;
  value: number;
  /** Preformatted value for the tooltip and callout. */
  text: string;
  /** Optional second line for the tooltip (e.g. the service breakdown). */
  detail?: string;
}

/**
 * One smooth line with a soft gradient area, faint gridlines, small point
 * dots and a callout on the last value — the chart style from the references.
 */
export function TrendLine({
  points,
  colour = '#5b6f82',
  height = 240,
  id = 'trend',
  label = 'Monthly household cost',
}: {
  points: TrendPoint[];
  colour?: string;
  height?: number;
  id?: string;
  /** Accessible name for the chart. */
  label?: string;
}) {
  const dark = useDarkMode();
  const c = seriesColour(colour, dark);
  const last = points[points.length - 1];
  return (
    <div style={{ width: '100%', height }} role="img" aria-label={label}>
      <ResponsiveContainer>
        <AreaChart data={points} margin={{ top: 30, right: 56, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id={`${id}-fill`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={c} stopOpacity={0.35} />
              <stop offset="100%" stopColor={c} stopOpacity={0} />
            </linearGradient>
            <filter id={`${id}-glow`} x="-10%" y="-40%" width="120%" height="180%">
              <feGaussianBlur stdDeviation="4" result="b" />
              <feMerge>
                <feMergeNode in="b" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          <CartesianGrid vertical={false} stroke={chartInk.grid} strokeDasharray="4 6" />
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
            width={40}
            tickCount={4}
            domain={[
              (min: number) => Math.floor(min * 0.94),
              (max: number) => Math.ceil(max * 1.06),
            ]}
            tickFormatter={(v: number) =>
              v >= 1000 ? `${(v / 1000).toFixed(v % 1000 ? 1 : 0)}k` : String(v)
            }
          />
          <Tooltip
            cursor={{ stroke: c, strokeOpacity: 0.35, strokeWidth: 1 }}
            contentStyle={{
              background: chartInk.tooltipBg,
              border: `1px solid ${chartInk.tooltipBorder}`,
              borderRadius: 14,
              fontSize: 12,
              color: 'var(--color-fg)',
              boxShadow: '0 12px 32px rgba(0,0,0,0.25)',
            }}
            labelStyle={{ color: 'var(--color-fg-muted)', marginBottom: 2 }}
            itemStyle={{ color: 'var(--color-fg)', fontWeight: 600 }}
            formatter={(_v, _n, item) => {
              const p = item.payload as TrendPoint;
              return [p.detail ? `${p.text} · ${p.detail}` : p.text, ''];
            }}
            separator=""
          />
          <Area
            type="monotone"
            dataKey="value"
            stroke={c}
            strokeWidth={2.5}
            fill={`url(#${id}-fill)`}
            dot={{ r: 3, fill: c, strokeWidth: 0 }}
            activeDot={{ r: 6, fill: c, stroke: 'var(--color-surface-solid)', strokeWidth: 2 }}
            isAnimationActive={false}
            filter={`url(#${id}-glow)`}
          />
          {last && (
            <ReferenceDot
              x={last.label}
              y={last.value}
              r={0}
              ifOverflow="visible"
              shape={(props: { cx?: number; cy?: number }) => {
                const cx = props.cx ?? 0;
                const cy = props.cy ?? 0;
                const w = last.text.length * 7.2 + 20;
                return (
                  <g>
                    <circle
                      cx={cx}
                      cy={cy}
                      r={6}
                      fill={c}
                      stroke="var(--color-surface-solid)"
                      strokeWidth={2.5}
                    />
                    <rect
                      x={cx - w / 2}
                      y={cy - 40}
                      width={w}
                      height={26}
                      rx={13}
                      fill="var(--color-surface-solid)"
                      stroke={chartInk.tooltipBorder}
                    />
                    <text
                      x={cx}
                      y={cy - 23}
                      textAnchor="middle"
                      fontSize={12}
                      fontWeight={700}
                      fill="var(--color-fg)"
                    >
                      {last.text}
                    </text>
                  </g>
                );
              }}
            />
          )}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
