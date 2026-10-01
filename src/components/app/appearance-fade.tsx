'use client';

import type { FormEvent, ReactNode } from 'react';

/** Which attribute on <html> each Appearance choice sets (see the root layout). */
const ATTR = { preset: 'palette', theme: 'theme', glass: 'glass' } as const;

type WithViewTransition = Document & { startViewTransition?: (update: () => void) => unknown };

/**
 * Settings → Appearance: picking colours, light or dark, or the glass fades
 * the page into the new look instead of cutting to it (owner, 2026-10-01).
 * The choice is put on <html> at once, inside a view transition, and the
 * form goes on to save it; the page the server sends back carries the same
 * attributes. Without view transitions, or with reduced motion, it just
 * switches.
 */
export function AppearanceFade({ children }: { children: ReactNode }) {
  const onSubmit = (e: FormEvent<HTMLDivElement>) => {
    const button = (e.nativeEvent as SubmitEvent).submitter;
    if (!(button instanceof HTMLButtonElement)) return;
    const key = ATTR[button.name as keyof typeof ATTR];
    if (!key) return;
    const html = document.documentElement;
    const apply = () => {
      // Automatic is no attribute at all: the device decides.
      if (button.value === 'auto') delete html.dataset[key];
      else html.dataset[key] = button.value;
      // The chosen card or segment shows as chosen straight away.
      button
        .closest('form')
        ?.querySelectorAll<HTMLButtonElement>(`button[name="${button.name}"]`)
        .forEach((b) => b.setAttribute('aria-pressed', String(b === button)));
    };
    const doc = document as WithViewTransition;
    if (doc.startViewTransition && !matchMedia('(prefers-reduced-motion: reduce)').matches)
      doc.startViewTransition(apply);
    else apply();
  };
  return (
    <div className="contents" onSubmitCapture={onSubmit}>
      {children}
    </div>
  );
}
