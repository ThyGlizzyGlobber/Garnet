import Link from 'next/link';
import type { ReactNode } from 'react';
import { Icon } from '@/components/app/icons';
import { cx } from '@/components/ui/cx';

/**
 * Small pieces the unshown screens share (R6): a stepper, a choice card, a
 * drop zone, a toggle row, a danger section, an "or" line, a section for a
 * form's side column. Server components; the client parts (keypad, code
 * boxes, pickers) are in pieces-client.tsx.
 */

/** The wizard's steps: done, the current one, the rest. */
export function Stepper({
  steps,
  current,
  onPick,
}: {
  steps: string[];
  /** 1-based. */
  current: number;
  /** In a client wizard, jump back to a done step. */
  onPick?: (n: number) => void;
}) {
  return (
    <ol className="stepper">
      {steps.map((s, i) => {
        const n = i + 1;
        const cls = n < current ? 'done' : n === current ? 'on' : undefined;
        const inner = (
          <>
            <i>{n < current ? <Icon name="check" width={12} height={12} /> : n}</i>
            <span>{s}</span>
          </>
        );
        return (
          <li key={s} className={cls}>
            {onPick && n < current ? (
              <button type="button" onClick={() => onPick(n)}>
                {inner}
              </button>
            ) : (
              <span className="step">{inner}</span>
            )}
          </li>
        );
      })}
    </ol>
  );
}

/** A big choice: an icon, a title and a line, as a link or a plain block. */
export function Choice({
  icon,
  title,
  sub,
  href,
  right,
  col = false,
  children,
}: {
  icon: string;
  title: ReactNode;
  sub?: ReactNode;
  href?: string;
  /** Something at the end (a Copy button); a chevron for a link. */
  right?: ReactNode;
  /** The row's own controls go under the text (a code field and Join). */
  col?: boolean;
  children?: ReactNode;
}) {
  const body = (
    <>
      <span className="choice-ic">
        <Icon name={icon} width={22} height={22} />
      </span>
      <span className="choice-t">
        <b>{title}</b>
        {sub && <span className="muted small">{sub}</span>}
        {children}
      </span>
      {right ?? (href && <Icon name="chevron-right" width={18} height={18} className="chev" />)}
    </>
  );
  if (href)
    return (
      <Link href={href} className="choice">
        {body}
      </Link>
    );
  return <div className={cx('choice', col && 'col')}>{body}</div>;
}

/** A row with a switch on the right: a title, a line under it, and the control. */
export function ToggleRow({
  title,
  sub,
  children,
}: {
  title: ReactNode;
  sub?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="tg-row">
      <span>
        <b>{title}</b>
        {sub && <span className="muted small">{sub}</span>}
      </span>
      {children}
    </div>
  );
}

/** "or", between two ways of doing the same thing. */
export function Or({ children }: { children: ReactNode }) {
  return (
    <div className="or">
      <span>{children}</span>
    </div>
  );
}
