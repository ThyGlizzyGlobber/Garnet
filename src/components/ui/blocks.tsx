import Link from 'next/link';
import type { ReactNode } from 'react';
import { Icon } from '@/components/app/icons';
import { formatMoneyParts } from '@/lib/format';
import type { Tone } from './chip';
import { CopyButton } from './copy';
import { cx } from './cx';

/** Small uppercase label above a title or figure. */
export function Eyebrow({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cx('eyebrow', className)}>{children}</div>;
}

/** A money figure with the cents set smaller. `size` is a class: hero-fig, fig-md, bp-amt… */
export function Money({
  minor,
  currency,
  locale,
  className,
}: {
  minor: number;
  currency: string;
  locale: string;
  className?: string;
}) {
  const p = formatMoneyParts(minor, currency, locale);
  return (
    <span className={cx('fig', className)}>
      {p.main}
      {p.minor && <small>{p.minor}</small>}
      {p.tail}
    </span>
  );
}

/** Rows of label and value; a value can be any node. */
export function Kv({
  rows,
  className,
}: {
  rows: ([string, ReactNode] | [string, ReactNode, string] | null | false | undefined)[];
  className?: string;
}) {
  return (
    <dl className={cx('kv', className)}>
      {rows.filter(Boolean).map((r) => {
        const [k, v, cls] = r as [string, ReactNode, string?];
        return (
          <div key={k} className={cx('kv-r', cls)}>
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        );
      })}
    </dl>
  );
}

/** A section's heading with something on the right (a count, a button). */
export function SectionHead({
  title,
  right,
  className,
}: {
  title: ReactNode;
  right?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cx('sec-head', className)}>
      <h3>{title}</h3>
      {right && <div className="sec-right">{right}</div>}
    </div>
  );
}

/** A tinted note that leads somewhere: something unusual, a question, a step to take. */
export function Notice({
  tone,
  icon,
  title,
  body,
  href,
  compact = false,
  className,
}: {
  tone: Tone;
  icon: string;
  title: ReactNode;
  body?: ReactNode;
  href: string;
  compact?: boolean;
  className?: string;
}) {
  return (
    <Link href={href} className={cx('notice', `t-${tone}`, compact && 'compact', className)}>
      <span className="notice-ic">
        <Icon name={icon} width={18} height={18} />
      </span>
      <span className="notice-t">
        <b>{title}</b>
        {body && <span>{body}</span>}
      </span>
      <Icon name="chevron-right" width={16} height={16} className="chev" />
    </Link>
  );
}

export interface TimelineStep {
  title: string;
  /** "Paid 12 Aug" or "Due 1 Oct 2026". */
  sub: string;
  amount?: string;
  state: 'done' | 'next' | 'later';
}

/** The instalment timeline: a dot per step, the paid ones ticked, the next one ringed. */
export function Timeline({ steps }: { steps: TimelineStep[] }) {
  return (
    <ol className="timeline">
      {steps.map((s) => (
        <li key={s.title} className={s.state === 'later' ? undefined : s.state}>
          <i className="tl-dot" aria-hidden="true">
            {s.state === 'done' && <Icon name="check" width={12} height={12} />}
          </i>
          <span className="tl-main">
            <b>{s.title}</b>
            <span>{s.sub}</span>
          </span>
          {s.amount && <span className="tl-amt">{s.amount}</span>}
        </li>
      ))}
    </ol>
  );
}

export interface FigureRowModel {
  label: string;
  /** The printed value ("1,684 kWh") or, for a comparison, the whole line. */
  value?: string;
  amount?: string;
  /** Change since the last bill, as a fraction (+0.11); 0 means the same; leave out when unknown. */
  change?: number | null;
  comparison?: boolean;
}

/** "From the bill": every figure a bill printed, with the change since the last one. */
export function FigureRows({
  rows,
  same,
  pct,
}: {
  rows: FigureRowModel[];
  /** The word for no change. */
  same: string;
  /** Formats a fraction as "+11%". */
  pct: (f: number) => string;
}) {
  return (
    <div className="figs">
      {rows.map((f) => (
        <div key={f.label} className="fig-r">
          <span className="fig-l">
            {f.label}
            {f.value && !f.comparison && <span className="muted">{f.value}</span>}
          </span>
          <span className="fig-v">
            {f.comparison ? (
              <span className="muted">{f.value}</span>
            ) : (
              <>
                {f.amount}
                {f.change == null ? null : f.change === 0 ? (
                  <span className="delta flat">{same}</span>
                ) : (
                  <span className={cx('delta', f.change > 0 ? 'up' : 'down')}>
                    <Icon name={f.change > 0 ? 'arrow-up' : 'arrow-down'} width={12} height={12} />
                    {pct(f.change)}
                  </span>
                )}
              </>
            )}
          </span>
        </div>
      ))}
    </div>
  );
}

/** A change since something, as an arrow and a figure: +11%, −18%, "same". */
export function Delta({ dir, children }: { dir: 'up' | 'down' | 'flat'; children: ReactNode }) {
  return (
    <span className={cx('delta', dir)}>
      {dir !== 'flat' && (
        <Icon name={dir === 'up' ? 'arrow-up' : 'arrow-down'} width={12} height={12} />
      )}
      {children}
    </span>
  );
}

/** The household's bills address with a Copy button. */
export function AddressCard({
  label,
  address,
  className,
}: {
  /** "Forward bills to" */
  label: string;
  address: string;
  className?: string;
}) {
  return (
    <div className={cx('address', className)}>
      <span className="address-ic">
        <Icon name="mail" width={18} height={18} />
      </span>
      <span className="address-t">
        <span className="muted small">{label}</span>
        <b className="mono">{address}</b>
      </span>
      <CopyButton value={address} className="btn btn-plain btn-sm" />
    </div>
  );
}

/** A thin progress bar, 0–1; `tone` warn when it's over. */
export function Progress({ value, tone }: { value: number; tone?: 'warn' }) {
  return (
    <div className={cx('progress', tone && `t-${tone}`)}>
      <i style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%` }} />
    </div>
  );
}

export interface StatModel {
  label: string;
  value: string;
  sub?: string;
}

/** A row of small figures with a label above and a line below (a service's year, month, latest, next). */
export function Stats({ stats, className }: { stats: StatModel[]; className?: string }) {
  return (
    <div className={cx('stats', className)}>
      {stats.map((s) => (
        <div key={s.label} className="stat">
          <span className="stat-l">{s.label}</span>
          <span className="stat-v">{s.value}</span>
          {s.sub && <span className="stat-s">{s.sub}</span>}
        </div>
      ))}
    </div>
  );
}
