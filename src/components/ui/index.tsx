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

/** A field's control: the Frost input (src/styles/screens.css, .inp-plain). */
export function Input({ className, ...props }: ComponentProps<'input'>) {
  return <input className={cx('inp-plain', className)} {...props} />;
}

export function Select({ className, ...props }: ComponentProps<'select'>) {
  return <select className={cx('inp-plain', className)} {...props} />;
}

export function Textarea({ className, ...props }: ComponentProps<'textarea'>) {
  return <textarea className={cx('inp-plain', className)} {...props} />;
}

/**
 * A labelled field: the label above, the control, then a hint or the error
 * under it. `state` colours the hint (a check for a matched detail, a warning
 * for one to look at); an error always reads as bad.
 */
export function Field({
  label,
  hint,
  error,
  state,
  optional = false,
  className,
  children,
}: {
  label: string;
  hint?: ReactNode;
  error?: string;
  state?: 'ok' | 'warn';
  /** Says "optional" after the label. */
  optional?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <label className={cx('fld', error ? 'bad' : state, className)}>
      <span className="fld-l">
        {label}
        {optional && <span className="muted"> · optional</span>}
      </span>
      {children}
      {error ? (
        <span className="fld-h">{error}</span>
      ) : hint ? (
        <span className="fld-h">{hint}</span>
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
