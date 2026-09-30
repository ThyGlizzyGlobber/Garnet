import Link from 'next/link';
import type { ComponentProps, ReactNode } from 'react';
import { Icon } from '@/components/app/icons';
import { Chip, type Tone } from './chip';
import { cx } from './cx';

/**
 * The primitives the screens share (BRAND.md §5–§7). Cards and buttons are
 * the Frost Glass classes from src/styles/components.css; the rest lays out
 * with utilities on the tokens.
 */

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
        <h1 className="text-[32px] leading-none sm:text-[40px]">{title}</h1>
        {subtitle && <p className="mt-1.5 text-fg-2">{subtitle}</p>}
      </div>
      {action}
    </header>
  );
}

const buttonVariants = {
  primary: 'btn-primary',
  secondary: 'btn-glass',
  danger: 'btn-danger',
  ghost: 'btn-plain',
};
export type ButtonVariant = keyof typeof buttonVariants;

/** A button: primary wears the accent, secondary is a glass capsule, ghost is plain text. */
export function Button({
  variant = 'primary',
  size,
  icon,
  className,
  children,
  ...props
}: ComponentProps<'button'> & { variant?: ButtonVariant; size?: 'sm'; icon?: string }) {
  return (
    <button
      className={cx('btn', buttonVariants[variant], size === 'sm' && 'btn-sm', className)}
      {...props}
    >
      {icon && (
        <Icon name={icon} width={size === 'sm' ? 15 : 18} height={size === 'sm' ? 15 : 18} />
      )}
      {children != null && <span>{children}</span>}
    </button>
  );
}

export function LinkButton({
  variant = 'primary',
  size,
  icon,
  className,
  children,
  ...props
}: ComponentProps<typeof Link> & { variant?: ButtonVariant; size?: 'sm'; icon?: string }) {
  return (
    <Link
      className={cx('btn', buttonVariants[variant], size === 'sm' && 'btn-sm', className)}
      {...props}
    >
      {icon && (
        <Icon name={icon} width={size === 'sm' ? 15 : 18} height={size === 'sm' ? 15 : 18} />
      )}
      {children != null && <span>{children}</span>}
    </Link>
  );
}

const inputClass =
  'w-full rounded-inner border border-line-2 bg-inset px-3 py-2.5 text-base text-fg outline-none placeholder:text-fg-2 focus-visible:outline-2 focus-visible:outline-accent';

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
      <span className="mb-1.5 block text-sm font-semibold text-fg-2">{label}</span>
      {children}
      {error ? (
        <span className="mt-1 block text-xs text-bad">{error}</span>
      ) : hint ? (
        <span className="mt-1 block text-xs text-fg-2">{hint}</span>
      ) : null}
    </label>
  );
}

const badgeTone: Record<'neutral' | 'success' | 'warning' | 'danger' | 'accent', Tone> = {
  neutral: 'neutral',
  success: 'ok',
  warning: 'warn',
  danger: 'bad',
  accent: 'info',
};

/** The pre-redesign name for a chip; the tones map onto the chip's. */
export function Badge({
  tone = 'neutral',
  children,
}: {
  tone?: keyof typeof badgeTone;
  children: ReactNode;
}) {
  return <Chip tone={badgeTone[tone]}>{children}</Chip>;
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
      {body && <p className="max-w-sm text-sm text-fg-2">{body}</p>}
      {action}
    </Card>
  );
}

export function ListRow({ href, children }: { href?: string; children: ReactNode }) {
  const cls =
    'flex items-center justify-between gap-4 px-5 py-3.5 transition hover:bg-inset first:rounded-t-card last:rounded-b-card';
  return href ? (
    <Link href={href} className={cls}>
      {children}
    </Link>
  ) : (
    <div className={cls}>{children}</div>
  );
}

export function List({ children }: { children: ReactNode }) {
  return <div className="glass divide-y divide-line rounded-card">{children}</div>;
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
          <h2 className="text-lg">{title}</h2>
        )}
        {hint && <p className="text-xs text-fg-2">{hint}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

const figureSizes = {
  hero: 'text-[52px]',
  xl: 'text-[44px] sm:text-[52px]',
  lg: 'text-[40px]',
  md: 'text-[34px]',
  sm: 'text-[32px]',
  xs: 'text-[26px]',
};
const figureTones = {
  plain: '',
  warning: 'text-warn',
  success: 'text-ok',
  danger: 'text-bad',
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
    <span className={cx('fig block', figureSizes[size], figureTones[tone], className)}>
      {children}
    </span>
  );
}

/** The filter capsule, for a chip that has to be another element (a submit button). */
export const filterChipClass = (active = false) => cx('chip-btn', active && 'on');

/** A filter capsule: a period, a status, a count that links somewhere. `active` fills it. */
export function FilterChip({
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
  const cls = cx('chip-btn', active && 'on', className);
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
 * navigation, styled as a glass button. `label` is hidden on phones when an
 * icon is given.
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
    <a href={href} download title={title} aria-label={label} className="btn btn-glass">
      {icon}
      <span className={icon ? 'hidden sm:inline' : undefined}>{label}</span>
    </a>
  );
}
