import Link from 'next/link';
import { colourCss } from '@/lib/palette';

export interface AheadItem {
  key: string;
  /** Which month column (0 = this month). */
  col: number;
  /** "$912", "~$748". */
  amount: string;
  colour: string;
  tip: string;
  href?: string;
  /** Not a bill yet: guessed from the ones before. */
  expected: boolean;
  /** Past its due date. */
  late?: boolean;
}

/**
 * The year ahead: a row per vehicle (or service) across the next twelve
 * months, a mark in each month something falls due, with its amount. A bill
 * still to pay is solid; a renewal the app expects is outlined.
 */
export function YearAhead({
  months,
  rows,
  label,
}: {
  /** Twelve short month names, this month first. */
  months: string[];
  rows: { key: string; label: string; items: AheadItem[] }[];
  label: string;
}) {
  return (
    <div className="ya" role="table" aria-label={label}>
      <div className="ya-row ya-head" role="row">
        <span role="columnheader" />
        {months.map((m, i) => (
          <span key={i} role="columnheader" className={i === 0 ? 'is-now' : undefined}>
            {m}
          </span>
        ))}
      </div>
      {rows.map((r) => (
        <div key={r.key} className="ya-row" role="row">
          <span className="ya-l" role="rowheader">
            {r.label}
          </span>
          {months.map((_, col) => (
            <span key={col} className={`ya-cell${col === 0 ? ' is-now' : ''}`} role="cell">
              {r.items
                .filter((i) => i.col === col)
                .map((i) => {
                  const cls = `ya-mark${i.expected ? ' is-exp' : ''}${i.late ? ' is-late' : ''}`;
                  const style = { ['--c' as string]: colourCss(i.colour) };
                  return i.href ? (
                    <Link key={i.key} href={i.href} className={cls} style={style} title={i.tip}>
                      {i.amount}
                    </Link>
                  ) : (
                    <span key={i.key} className={cls} style={style} title={i.tip}>
                      {i.amount}
                    </span>
                  );
                })}
            </span>
          ))}
        </div>
      ))}
    </div>
  );
}
