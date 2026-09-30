export interface PillItem {
  label: string;
  value: number;
  /** The value as short text ("$2.9k"). */
  short: string;
  tip?: string;
}

/** The forecast strip: pill bars, the first solid, the rest hatched (estimates). */
export function ForecastPills({
  items,
  showAll = false,
}: {
  items: PillItem[];
  showAll?: boolean;
}) {
  const max = Math.max(...items.map((i) => i.value));
  const min = Math.min(...items.map((i) => i.value));
  return (
    <div
      className="pills"
      style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}
    >
      {items.map((it, i) => (
        <div key={it.label} className="pill-col" data-tip={it.tip}>
          <span className="pill-v">{showAll || i === 0 ? it.short : ''}</span>
          <i
            className={i === 0 ? 'pill solid' : 'pill'}
            style={{ height: `${38 + ((it.value - min) / (max - min || 1)) * 62}%` }}
          />
          <span className="pill-l">{it.label}</span>
        </div>
      ))}
    </div>
  );
}
