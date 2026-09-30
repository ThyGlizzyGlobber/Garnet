import Link from 'next/link';
import type { ReactNode } from 'react';
import { Disc } from '@/components/ui/colour';
import { Icon } from './icons';

/**
 * A tile for one vehicle or service on its main service's page: what it is,
 * its last twelve months, and what's next; the whole tile opens its own page.
 */
export function SummaryTile({
  href,
  icon,
  colour,
  title,
  meta,
  figure,
  figureSub,
  mix,
  next,
  muted = false,
}: {
  href: string;
  icon: string;
  colour: string;
  title: string;
  /** Under the name: the plate, the provider, "Yours". */
  meta?: ReactNode;
  /** The big figure (the last 12 months) and the line under it. */
  figure: string;
  figureSub: string;
  /** Where its money goes (a bar by kind), when it has more than one. */
  mix?: ReactNode;
  /** The foot: what's next, or that nothing is. */
  next: ReactNode;
  /** Stopped or cancelled: drawn quieter. */
  muted?: boolean;
}) {
  return (
    <Link href={href} className={`glass vx-tile rounded-card${muted ? ' is-muted' : ''}`}>
      <span className="vx-h">
        <Disc icon={icon} colour={colour} />
        <span className="vx-t">
          <b>{title}</b>
          {meta && <span className="muted small">{meta}</span>}
        </span>
        <Icon name="chevron-right" width={18} height={18} className="vx-chev" />
      </span>
      <span className="vx-fig">
        <span className="fig fig-md">{figure}</span>
        <span className="muted small">{figureSub}</span>
      </span>
      {mix}
      <span className="vx-next">{next}</span>
    </Link>
  );
}
