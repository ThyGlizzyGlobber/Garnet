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

/** Big number tile, as on the dashboard. `hero` tints it with the accent. */
export function Stat({
  label,
  value,
  hint,
  hero,
  tone,
  className,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  hero?: boolean;
  tone?: 'warning' | 'success' | 'accent';
  className?: string;
}) {
  const valueTone =
    tone === 'warning'
      ? 'text-warning'
      : tone === 'success'
        ? 'text-success'
        : tone === 'accent'
          ? 'text-accent'
          : '';
  return (
    <Card
      className={cx('flex flex-col gap-2', hero && 'border-accent/40 bg-accent-soft', className)}
    >
      <span className="text-sm font-semibold">{label}</span>
      <span
        className={cx(
          'font-display text-[34px] leading-none font-semibold tracking-tight tabular-nums',
          valueTone,
        )}
      >
        {value}
      </span>
      {hint && <span className="text-xs text-fg-muted">{hint}</span>}
    </Card>
  );
}
