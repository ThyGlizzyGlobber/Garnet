import Link from 'next/link';
import type { ComponentProps, ReactNode } from 'react';

function cx(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(' ');
}

export function Card({ className, ...props }: ComponentProps<'section'>) {
  return <section className={cx('glass rounded-card p-5', className)} {...props} />;
}

export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <header className="mb-5 flex items-end justify-between gap-4">
      <div>
        <h1 className="font-display text-[28px] leading-tight font-semibold tracking-tight sm:text-[36px]">
          {title}
        </h1>
        {subtitle && <p className="mt-1 text-sm text-fg-muted">{subtitle}</p>}
      </div>
      {action}
    </header>
  );
}

const buttonBase =
  'inline-flex items-center justify-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition active:scale-[0.98] disabled:opacity-50';
const buttonVariants = {
  primary: 'bg-accent text-accent-fg hover:opacity-90',
  secondary: 'glass text-fg hover:bg-surface-2',
  danger: 'bg-danger-soft text-danger hover:opacity-90',
  ghost: 'text-accent hover:bg-surface-2',
};
export type ButtonVariant = keyof typeof buttonVariants;

export function Button({
  variant = 'primary',
  className,
  ...props
}: ComponentProps<'button'> & { variant?: ButtonVariant }) {
  return <button className={cx(buttonBase, buttonVariants[variant], className)} {...props} />;
}

export function LinkButton({
  variant = 'primary',
  className,
  ...props
}: ComponentProps<typeof Link> & { variant?: ButtonVariant }) {
  return <Link className={cx(buttonBase, buttonVariants[variant], className)} {...props} />;
}

const inputClass =
  'w-full rounded-2xl border border-border-strong bg-surface-2 px-3.5 py-2.5 text-base text-fg outline-none placeholder:text-fg-muted focus:border-accent focus:ring-2 focus:ring-accent/30';

export function Input({ className, ...props }: ComponentProps<'input'>) {
  return <input className={cx(inputClass, className)} {...props} />;
}

export function Select({ className, ...props }: ComponentProps<'select'>) {
  return <select className={cx(inputClass, 'appearance-none', className)} {...props} />;
}

export function Textarea({ className, ...props }: ComponentProps<'textarea'>) {
  return <textarea className={cx(inputClass, 'min-h-24', className)} {...props} />;
}

export function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium">{label}</span>
      {children}
      {error ? (
        <span className="mt-1 block text-xs text-danger">{error}</span>
      ) : hint ? (
        <span className="mt-1 block text-xs text-fg-muted">{hint}</span>
      ) : null}
    </label>
  );
}

export function Badge({
  tone = 'neutral',
  children,
}: {
  tone?: 'neutral' | 'success' | 'warning' | 'danger' | 'accent';
  children: ReactNode;
}) {
  const tones = {
    neutral: 'bg-surface-2 text-fg-muted',
    success: 'bg-success-soft text-success',
    warning: 'bg-warning-soft text-warning',
    danger: 'bg-danger-soft text-danger',
    accent: 'bg-accent-soft text-accent',
  };
  return (
    <span
      className={cx('inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-bold', tones[tone])}
    >
      {children}
    </span>
  );
}

export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body?: string;
  action?: ReactNode;
}) {
  return (
    <Card className="flex flex-col items-center gap-3 py-12 text-center">
      <p className="font-display text-lg font-semibold">{title}</p>
      {body && <p className="max-w-sm text-sm text-fg-muted">{body}</p>}
      {action}
    </Card>
  );
}

export function ListRow({ href, children }: { href?: string; children: ReactNode }) {
  const cls =
    'flex items-center justify-between gap-4 px-5 py-3.5 transition hover:bg-surface-2 first:rounded-t-card last:rounded-b-card';
  return href ? (
    <Link href={href} className={cls}>
      {children}
    </Link>
  ) : (
    <div className={cls}>{children}</div>
  );
}

export function List({ children }: { children: ReactNode }) {
  return <div className="glass divide-y divide-border rounded-card">{children}</div>;
}

const tileTones = {
  plain: '',
  accent: 'bg-accent-soft',
  danger: 'bg-danger-soft',
};

/**
 * A dashboard tile: glass, lifting on hover. With `href` the whole tile is a
 * link. Every tile carries one instrument or figure (BRAND.md).
 */
export function Tile({
  href,
  tone = 'plain',
  className,
  children,
}: {
  href?: string;
  tone?: keyof typeof tileTones;
  className?: string;
  children: ReactNode;
}) {
  const cls = cx('glass lift rounded-card p-5 sm:p-6', tileTones[tone], className);
  return href ? (
    <Link href={href} className={cx(cls, 'text-fg')}>
      {children}
    </Link>
  ) : (
    <section className={cls}>{children}</section>
  );
}

/** A tile's heading row: title (and a line under it) with something on the right. */
export function TileHeader({
  title,
  hint,
  action,
  small = false,
}: {
  title: ReactNode;
  hint?: ReactNode;
  action?: ReactNode;
  /** A small label-style title (the instrument tiles) instead of a heading. */
  small?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        {small ? (
          <p className="text-sm font-semibold">{title}</p>
        ) : (
          <h2 className="font-display text-lg font-semibold">{title}</h2>
        )}
        {hint && <p className="text-xs text-fg-muted">{hint}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

const figureSizes = {
  hero: 'text-[44px] tracking-tight',
  xl: 'text-[38px] tracking-tight sm:text-[44px]',
  lg: 'text-[40px] tracking-tight',
  md: 'text-[34px] tracking-tight',
  sm: 'text-[32px]',
  xs: 'text-[26px]',
};
const figureTones = {
  plain: '',
  warning: 'text-warning',
  success: 'text-success',
  danger: 'text-danger',
  accent: 'text-accent',
};

/** A big number: money, a percentage, a count. */
export function Figure({
  size = 'lg',
  tone = 'plain',
  className,
  children,
}: {
  size?: keyof typeof figureSizes;
  tone?: keyof typeof figureTones;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={cx(
        'block font-display leading-none font-semibold tabular-nums',
        figureSizes[size],
        figureTones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

const bannerTones = {
  danger: 'bg-danger-soft text-danger',
  warning: 'bg-warning-soft text-warning',
  accent: 'bg-accent-soft text-accent',
};

/** A full-width link asking for attention (a bill problem, a question, the Inbox). */
export function Banner({
  href,
  tone,
  open,
  children,
}: {
  href: string;
  tone: keyof typeof bannerTones;
  /** The call to action on the right ("Open", "Review"). */
  open: string;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      className={cx(
        'mb-4 flex items-center justify-between gap-3 rounded-card px-5 py-3 text-sm font-semibold',
        bannerTones[tone],
      )}
    >
      <span>{children}</span>
      <span className="shrink-0">
        {open} <span aria-hidden="true">→</span>
      </span>
    </Link>
  );
}

/** The pill look, for a chip that has to be another element (a submit button). */
export const chipClass = (active = false) =>
  cx(
    'rounded-full px-4 py-2 text-sm font-semibold transition',
    active ? 'bg-accent text-accent-fg' : 'bg-surface-2 text-fg-muted hover:text-fg',
  );

/** A pill: a filter, a period, a count that links somewhere. `active` fills it. */
export function Chip({
  href,
  active = false,
  className,
  children,
}: {
  href?: string;
  active?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const cls = cx(chipClass(active), className);
  return href ? (
    <Link href={href} className={cls} aria-current={active ? 'page' : undefined}>
      {children}
    </Link>
  ) : (
    <span className={cls}>{children}</span>
  );
}

/**
 * A file download (an export, a statement): a plain link, not client-side
 * navigation, styled as a secondary button. `label` is hidden on phones when
 * an icon is given.
 */
export function DownloadButton({
  href,
  label,
  title,
  icon,
}: {
  href: string;
  label: string;
  title?: string;
  icon?: ReactNode;
}) {
  return (
    <a
      href={href}
      download
      title={title}
      aria-label={label}
      className={cx(buttonBase, buttonVariants.secondary)}
    >
      {icon}
      <span className={icon ? 'hidden sm:inline' : undefined}>{label}</span>
    </a>
  );
}
