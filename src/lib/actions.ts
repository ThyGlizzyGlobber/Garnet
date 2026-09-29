import { getTranslations } from 'next-intl/server';
import type { z } from 'zod';
import type { ActionState } from '@/components/ui/form';

/**
 * Form errors for ActionForm. Schemas give their messages as keys in the
 * `errors` messages ("required", "validDate"); they're translated here, so no
 * English is written in actions. A message that isn't a key is shown as is.
 */
export async function zodToState(error: z.ZodError): Promise<ActionState> {
  const t = await getTranslations('errors');
  const fieldErrors: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join('.') || '_';
    if (!fieldErrors[key])
      fieldErrors[key] = t.has(issue.message as never) ? t(issue.message as never) : issue.message;
  }
  return { error: t('fixFields'), fieldErrors };
}

/** "Please fix the highlighted fields", with each field's message (a key in `errors`). */
export async function fieldErrors(errors: Record<string, string>): Promise<ActionState> {
  const t = await getTranslations('errors');
  const translated = Object.fromEntries(
    Object.entries(errors).map(([k, v]) => [k, t.has(v as never) ? t(v as never) : v]),
  );
  return { error: t('fixFields'), fieldErrors: translated };
}

/** The `errors` messages, for an action's own errors ("Service not found"). */
export const errorText = () => getTranslations('errors');

export function str(fd: FormData, key: string): string {
  const v = fd.get(key);
  return typeof v === 'string' ? v.trim() : '';
}

export function optStr(fd: FormData, key: string): string | null {
  const s = str(fd, key);
  return s === '' ? null : s;
}
