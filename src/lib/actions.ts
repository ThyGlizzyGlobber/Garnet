import type { z } from 'zod';
import type { ActionState } from '@/components/ui/form';

/** Convert a zod failure into a field-keyed error map for ActionForm. */
export function zodToState(error: z.ZodError): ActionState {
  const fieldErrors: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join('.') || '_';
    if (!fieldErrors[key]) fieldErrors[key] = issue.message;
  }
  return { error: 'Please fix the highlighted fields.', fieldErrors };
}

export function str(fd: FormData, key: string): string {
  const v = fd.get(key);
  return typeof v === 'string' ? v.trim() : '';
}

export function optStr(fd: FormData, key: string): string | null {
  const s = str(fd, key);
  return s === '' ? null : s;
}
