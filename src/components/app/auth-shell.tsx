import type { ReactNode } from 'react';
import { ForgetOfflinePages } from './pwa';

/** Centred frosted window for sign-in, onboarding and invite pages. */
export function AuthShell({
  eyebrow,
  title,
  subtitle,
  children,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-4 py-10">
      <ForgetOfflinePages />
      <div className="window flex flex-col gap-5 p-6 sm:p-8">
        <div>
          {eyebrow && <p className="text-sm font-medium text-fg-muted">{eyebrow}</p>}
          <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight">{title}</h1>
          {subtitle && <p className="mt-2 text-sm text-fg-muted">{subtitle}</p>}
        </div>
        {children}
      </div>
    </main>
  );
}

export function Notice({
  tone = 'neutral',
  children,
}: {
  tone?: 'neutral' | 'danger';
  children: ReactNode;
}) {
  return (
    <p
      role={tone === 'danger' ? 'alert' : 'status'}
      className={`rounded-xl px-4 py-3 text-sm font-medium ${tone === 'danger' ? 'bg-danger-soft text-danger' : 'bg-surface-2 text-fg-muted'}`}
    >
      {children}
    </p>
  );
}
