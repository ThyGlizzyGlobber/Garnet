'use client';

import { useActionState, type ReactNode } from 'react';
import { Button } from './index';

export interface ActionState {
  error?: string;
  fieldErrors?: Record<string, string>;
  ok?: boolean;
}

export type FormAction = (prev: ActionState, formData: FormData) => Promise<ActionState>;

/**
 * Thin wrapper around a server action: shows a top-level error and passes
 * field errors to children via a render function.
 */
export function ActionForm({
  action,
  submitLabel,
  children,
  className,
  footer,
  hideSubmit,
  id,
}: {
  action: FormAction;
  submitLabel: string;
  children: (fieldErrors: Record<string, string>, pending: boolean) => ReactNode;
  className?: string;
  footer?: ReactNode;
  /** Render your own submit button inside children (e.g. a paged wizard). */
  hideSubmit?: boolean;
  id?: string;
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(action, {});
  return (
    <form id={id} action={formAction} className={className ?? 'flex flex-col gap-4'}>
      {state.error && (
        <p
          role="alert"
          className="rounded-xl bg-danger-soft px-4 py-3 text-sm font-medium text-danger"
        >
          {state.error}
        </p>
      )}
      {children(state.fieldErrors ?? {}, pending)}
      {!hideSubmit && (
        <div className="mt-2 flex items-center justify-between gap-3">
          {footer ?? <span />}
          <Button type="submit" disabled={pending}>
            {pending ? '…' : submitLabel}
          </Button>
        </div>
      )}
    </form>
  );
}

/** A one-button form for a server action that takes no user input beyond hidden fields. */
export function InlineAction({
  action,
  label,
  variant = 'secondary',
  hidden = {},
  confirm,
}: {
  action: (formData: FormData) => Promise<void>;
  label: string;
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  hidden?: Record<string, string>;
  confirm?: string;
}) {
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (confirm && !window.confirm(confirm)) e.preventDefault();
      }}
    >
      {Object.entries(hidden).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <Button type="submit" variant={variant}>
        {label}
      </Button>
    </form>
  );
}
