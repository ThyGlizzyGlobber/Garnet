import { colourCss } from '@/lib/palette';

export interface MonthBar {
  /** Under the bar ("Oct"). */
  label: string;
  parts: { value: number; colour: string; tip: string }[];
}

/**
 * A column per month, stacked by series (rego, insurance…; or one service
 * each), heights against the busiest month. Hover a part for its figure.
 */
export function MonthBars({ bars, label }: { bars: MonthBar[]; label: string }) {
  const top = Math.max(...bars.map((b) => b.parts.reduce((s, p) => s + p.value, 0)), 1);
  return (
    <figure className="chart chart-months" aria-label={label}>
      <div className="chart-plot">
        <i className="chart-grid" style={{ top: '100%' }} />
        <div className="mb-cols">
          {bars.map((b) => (
            <div key={b.label} className="mb-col">
              {b.parts.map((p, i) => (
                <i
                  key={i}
                  className="mb-part"
                  style={{
                    height: `${(p.value / top) * 100}%`,
                    ['--c' as string]: colourCss(p.colour),
                  }}
                  data-tip={p.tip}
                  aria-label={p.tip}
                  role="img"
                />
              ))}
            </div>
          ))}
        </div>
        <span className="chart-tip" hidden />
      </div>
      <div className="mb-x" aria-hidden="true">
        {bars.map((b) => (
          <span key={b.label}>{b.label}</span>
        ))}
      </div>
    </figure>
  );
}
