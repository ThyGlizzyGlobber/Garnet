import { darkVariant } from '@/lib/palette';

/** Legend swatches using CSS light-dark() so they match the chart in both themes. */
export function Legend({ items }: { items: { id: string; name: string; colour: string }[] }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-fg-muted">
      {items.map((s) => (
        <li key={s.id} className="flex items-center gap-1.5">
          <span
            className="size-2.5 rounded-sm"
            style={{ background: `light-dark(${s.colour}, ${darkVariant(s.colour)})` }}
          />
          {s.name}
        </li>
      ))}
    </ul>
  );
}
