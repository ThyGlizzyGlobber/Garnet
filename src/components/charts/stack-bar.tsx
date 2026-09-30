import { colourCss } from '@/lib/palette';

export interface StackPart {
  value: number;
  colour: string;
  label: string;
  /** The value as text, for the accessible name. */
  text?: string;
  tip?: string;
  hatch?: boolean;
}

/** A horizontal stacked bar with a 2 px gap between parts (who pays what, cost by service). */
export function StackBar({ parts, thin = false }: { parts: StackPart[]; thin?: boolean }) {
  const total = parts.reduce((a, p) => a + p.value, 0) || 1;
  return (
    <div
      className={thin ? 'stackbar thin' : 'stackbar'}
      role="img"
      aria-label={parts.map((p) => `${p.label}: ${p.text ?? ''}`.trim()).join(', ')}
    >
      {parts.map((p) => (
        <i
          key={p.label}
          className={p.hatch ? 'hatch' : undefined}
          style={{ flex: p.value / total, ['--c' as string]: colourCss(p.colour) }}
          data-tip={p.tip}
        />
      ))}
    </div>
  );
}
