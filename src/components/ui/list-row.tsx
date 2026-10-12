import Link from 'next/link';
import type { ReactNode } from 'react';
import { Icon } from '@/components/app/icons';
import { cx } from './cx';

/**
 * The shared pieces of the October 2026 redesign (SCOPE-redesign-2.md §3):
 * the list row with its icon tile, the status pill, the month section and
 * the small group label. Each takes formatted strings, so the numbers stay
 * in src/lib and these only lay them out. A row is a real link or button.
 * Styles in src/styles/redesign.css.
 */

export type PillTone = 'ok' | 'soon' | 'bad' | 'neutral';

const pillIcon: Record<PillTone, string> = {
  ok: 'check',
  soon: 'clock',
  bad: 'alert',
  neutral: 'calendar',
};

/** A status pill: green paid, amber due or expected (with a clock), red overdue. Never colour alone. */
export function StatusPill({
  tone,
  icon,
  className,
  children,
}: {
  tone: PillTone;
  /** Replaces the tone's icon; `null` leaves it out (the Expected pill in Bills). */
  icon?: string | null;
  className?: string;
  children: ReactNode;
}) {
  const name = icon === undefined ? pillIcon[tone] : icon;
  return (
    <span className={cx('spill', tone, className)}>
      {name && <Icon name={name} width={14} height={14} />}
      <span>{children}</span>
    </span>
  );
}

/** The word Paid in plain green with a tick, for a dimmed row. */
export function PaidText({ children }: { children: ReactNode }) {
  return (
    <span className="pill-txt">
      <Icon name="check" width={14} height={14} />
      {children}
    </span>
  );
}

/** A 44 px icon tile. */
function IconTile({ icon, className }: { icon: string; className?: string }) {
  return (
    <span className={cx('lr-ico', className)} aria-hidden="true">
      <Icon name={icon} width={22} height={22} />
    </span>
  );
}

export interface ListRowProps {
  href?: string;
  /** The icon tile, or any node to draw in its place (an avatar). */
  icon?: string;
  lead?: ReactNode;
  name: ReactNode;
  /** A small mark after the name (the repeat icon for a recurring bill). */
  mark?: ReactNode;
  sub?: ReactNode;
  /** The status column: a pill, or muted words. Left out for rows without one. */
  status?: ReactNode;
  /** The amount; a dash when there's nothing this month. */
  amount?: ReactNode;
  /** In place of the amount: a figure with a line under it ("$62.77 / Filed to Electricity"). */
  end?: { a: ReactNode; l?: ReactNode } | null;
  /** quiet: nothing due; paid: dimmed with the amount quiet. */
  variant?: 'quiet' | 'paid';
  /** No status column at all (Members, Inbox). */
  noStat?: boolean;
  /** A wider end column (Inbox: the amount and where it was filed). */
  wideStat?: boolean;
  chevron?: boolean;
  className?: string;
  /** A form's submit button instead of a link (opening a household). */
  button?: boolean;
  ariaLabel?: string;
}

export function ListRow({
  href,
  icon,
  lead,
  name,
  mark,
  sub,
  status,
  amount,
  end,
  variant,
  noStat = false,
  wideStat = false,
  chevron = true,
  className,
  button = false,
  ariaLabel,
}: ListRowProps) {
  const cls = cx('lr', variant, noStat && 'no-stat', wideStat && 'wide-stat', className);
  const inner = (
    <>
      {lead ?? (icon ? <IconTile icon={icon} /> : <span />)}
      <span className="lr-main">
        <span className="lr-name">
          <span>{name}</span>
          {mark}
        </span>
        {sub && <span className="lr-sub">{sub}</span>}
      </span>
      {!noStat && !wideStat && <span className="lr-stat">{status}</span>}
      {end !== undefined ? (
        <span className="lr-end">
          {end && (
            <>
              <span className="a">{end.a}</span>
              {end.l && <span className="l">{end.l}</span>}
            </>
          )}
        </span>
      ) : (
        <span className={cx('lr-amt', amount === null && 'dash')}>{amount ?? '—'}</span>
      )}
      {chevron && <Icon name="chevron-right" width={18} height={18} className="lr-chev" />}
    </>
  );
  if (button)
    return (
      <button type="submit" className={cls} aria-label={ariaLabel}>
        {inner}
      </button>
    );
  if (href)
    return (
      <Link href={href} className={cls} aria-label={ariaLabel}>
        {inner}
      </Link>
    );
  return <div className={cx(cls, 'static')}>{inner}</div>;
}

/** The muted words in a row's status column ("Nothing due", "Next about 24 Dec"). */
export function Later({ children }: { children: ReactNode }) {
  return <span className="later">{children}</span>;
}

/** A small label over a run of rows: "To pay · 1". */
export function GroupLabel({
  tone,
  count,
  children,
}: {
  tone?: PillTone;
  count?: number;
  children: ReactNode;
}) {
  return (
    <div className={cx('gl', tone)}>
      <span>{children}</span>
      {count !== undefined && <b>{count}</b>}
    </div>
  );
}

/** A card of rows, with an optional heading carrying a figure on the right. */
export function RowCard({
  title,
  right,
  id,
  className,
  children,
}: {
  title?: ReactNode;
  right?: ReactNode;
  id?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={cx('rd-card', className)} aria-labelledby={title && id ? id : undefined}>
      {title && (
        <div className="ghead">
          <h2 id={id}>{title}</h2>
          {right && <span>{right}</span>}
        </div>
      )}
      {children}
    </section>
  );
}

/**
 * The month section: the month's name, year and count (and figures) on the
 * left, a card of rows on the right; one column under 900 px.
 */
export function MonthSection({
  id,
  month,
  sub,
  figure,
  below,
  children,
}: {
  id: string;
  month: string;
  /** "2026 · 7 bills" */
  sub: string;
  /** The month's total, as parts (main, minor). */
  figure?: { main: string; minor: string; tail: string } | null;
  /** Under the figure: the paid / still-to-come split, or an All paid pill. */
  below?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="msec" aria-labelledby={id}>
      <div className="msec-h">
        <h2 id={id}>{month}</h2>
        <p className="msec-sub">{sub}</p>
        {figure && (
          <div className="msec-fig">
            {figure.main}
            {figure.minor && <small>{figure.minor}</small>}
            {figure.tail}
          </div>
        )}
        {below}
      </div>
      <div className="rd-card">{children}</div>
    </section>
  );
}

/**
 * Progressive disclosure: the first rows, then "Show all N" that reveals the
 * rest in place. A details element, so it needs no script.
 */
export function MoreRows({
  shown,
  rest,
  label,
}: {
  shown: ReactNode;
  rest: ReactNode[];
  label: string;
}) {
  if (!rest.length) return <>{shown}</>;
  return (
    <>
      {shown}
      <details className="more-rows">
        <summary>
          {label}
          <Icon name="chevron-down" width={16} height={16} />
        </summary>
        {rest}
      </details>
    </>
  );
}
