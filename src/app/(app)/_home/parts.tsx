import Link from 'next/link';
import type { ReactNode } from 'react';
import { ColourBar, IconDisc, Swatch } from '@/components/ui/colour';

/**
 * Rows shared by the household (Home) and personal (Mine) dashboards. The
 * wording and numbers come in ready-made; these only lay them out.
 */

/** A bill in a short list: its service's icon, name, a status line, and the amount due. */
export function BillRow({
  href,
  icon,
  colour,
  name,
  status,
  tone = 'muted',
  amount,
}: {
  href: string;
  icon: string;
  colour: string;
  name: string;
  status: ReactNode;
  tone?: 'muted' | 'danger' | 'warning';
  amount: string;
}) {
  const toneClass = { muted: 'text-fg-muted', danger: 'text-danger', warning: 'text-warning' }[
    tone
  ];
  return (
    <Link href={href} className="flex items-center gap-3">
      <IconDisc icon={icon} colour={colour} />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm font-semibold">{name}</span>
        <span className={`truncate text-xs ${toneClass}`}>{status}</span>
      </span>
      <span className="text-sm font-semibold tabular-nums">{amount}</span>
    </Link>
  );
}

/** Services ranked by what they cost, each with a bar relative to the biggest. */
export function RankingList({
  rows,
  empty,
}: {
  rows: {
    id: string;
    name: string;
    colour: string;
    amount: string;
    minor: number;
    note?: string;
  }[];
  empty: string;
}) {
  if (rows.length === 0) return <p className="mt-3 text-sm text-fg-muted">{empty}</p>;
  const max = rows[0]!.minor;
  return (
    <ul className="mt-3 flex flex-col gap-3">
      {rows.map((row) => (
        <li key={row.id}>
          <div className="flex items-center justify-between gap-2 text-sm">
            <span className="flex min-w-0 items-center gap-2">
              <Swatch colour={row.colour} />
              <span className="truncate">{row.name}</span>
              {row.note && <span className="shrink-0 text-xs text-fg-muted">{row.note}</span>}
            </span>
            <span className="font-semibold tabular-nums">{row.amount}</span>
          </div>
          <ColourBar colour={row.colour} pct={Math.max(4, Math.round((row.minor / max) * 100))} />
        </li>
      ))}
    </ul>
  );
}

/** Household · Mine switch at the top of Home. */
export function ViewToggle({
  mine,
  labels,
}: {
  mine: boolean;
  labels: { household: string; mine: string; label: string };
}) {
  const seg = (on: boolean) =>
    `rounded-full px-4 py-1.5 text-sm font-semibold transition ${on ? 'bg-accent text-accent-fg' : 'text-fg-muted hover:text-fg'}`;
  return (
    <nav aria-label={labels.label} className="glass flex items-center gap-1 rounded-full p-1">
      <Link href="/" className={seg(!mine)} aria-current={!mine ? 'page' : undefined}>
        {labels.household}
      </Link>
      <Link href="/?view=mine" className={seg(mine)} aria-current={mine ? 'page' : undefined}>
        {labels.mine}
      </Link>
    </nav>
  );
}

/** The two-line greeting that opens Home and Mine. */
export function Greeting({
  hello,
  line,
  children,
}: {
  hello: string;
  line: string;
  /** Chips and switches on the right. */
  children?: ReactNode;
}) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <h1 className="font-display text-[32px] leading-[1.06] font-semibold tracking-tight sm:text-[42px]">
        {hello}
        <br />
        <span className="font-normal text-fg-muted">{line}</span>
      </h1>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </header>
  );
}
