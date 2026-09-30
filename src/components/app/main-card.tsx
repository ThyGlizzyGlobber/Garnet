import Link from 'next/link';
import type { ReactNode } from 'react';
import { Chip, StatusChip, type Tone } from '@/components/ui/chip';
import { Disc } from '@/components/ui/colour';
import { colourCss } from '@/lib/palette';
import { Icon } from './icons';

/**
 * One card on a main service's page (a vehicle, Bupa, Netflix): what it is
 * and where it stands on one line, and its bills inside, shown by opening the
 * card. Closed by default, unless it's the one asked for (?open=) or the only one.
 */
export function MainCard({
  id,
  open = false,
  icon,
  colour,
  title,
  meta,
  amount,
  status,
  year,
  flag,
  muted = false,
  children,
  footer,
}: {
  /** The anchor (#…) the nav and back links open it by. */
  id: string;
  open?: boolean;
  icon: string;
  colour: string;
  title: string;
  /** Under the title: provider, plate, "Yours"… */
  meta?: ReactNode;
  /** Where it stands: the latest bill's amount and status, or what's coming. */
  amount?: string;
  status?: { label: string; tone: Tone };
  /** "$1,036 in the last 12 months". */
  year?: string;
  /** A word that needs seeing: "Cancelled", "Still charging". */
  flag?: { label: string; tone: Tone };
  /** Cancelled or stopped: drawn quieter. */
  muted?: boolean;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <details
      id={id}
      open={open}
      className={`glass mcard rounded-card${muted ? ' is-muted' : ''}`}
      style={{ ['--svc' as string]: colourCss(colour) }}
    >
      <summary>
        <Disc icon={icon} colour={colour} />
        <span className="mcard-t">
          <b>{title}</b>
          {meta && <span className="muted small">{meta}</span>}
        </span>
        {flag && (
          <Chip tone={flag.tone} className="mcard-flag">
            {flag.label}
          </Chip>
        )}
        <span className="mcard-f">
          {amount && <span className="fig">{amount}</span>}
          {status && <StatusChip status={status} />}
        </span>
        {year && <span className="mcard-y muted small">{year}</span>}
        <Icon name="chevron-down" width={18} height={18} className="mcard-chev" />
      </summary>
      <div className="mcard-body">
        {children}
        {footer && <div className="mcard-foot">{footer}</div>}
      </div>
    </details>
  );
}

/** A plain link at the foot of a card ("Service details", "Edit vehicle"). */
export function CardLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="btn btn-plain btn-sm">
      {children}
    </Link>
  );
}
