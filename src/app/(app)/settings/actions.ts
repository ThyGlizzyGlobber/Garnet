'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import type { ActionState } from '@/components/ui/form';
import { str, zodToState } from '@/lib/actions';
import { requireOwner } from '@/lib/auth/session';
import { updateHousehold } from '@/lib/households';

const schema = z.object({
  name: z.string().min(1, 'Required').max(60),
  currency: z.string().regex(/^[A-Za-z]{3}$/, 'Use a 3-letter currency code'),
  locale: z.string().min(2, 'Required'),
  timezone: z
    .string()
    .refine((tz) => Intl.supportedValuesOf('timeZone').includes(tz), 'Unknown timezone'),
  fiscalYearStartMonth: z.coerce.number().int().min(1).max(12),
  weekStartsOn: z.coerce.number().int().min(0).max(6),
  splitMode: z.enum(['shared', 'single']),
  paymentReferenceTemplate: z.string().min(1, 'Required').max(60),
});

export async function updateSettingsAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  await requireOwner();
  const parsed = schema.safeParse({
    name: str(fd, 'name'),
    currency: str(fd, 'currency'),
    locale: str(fd, 'locale'),
    timezone: str(fd, 'timezone'),
    fiscalYearStartMonth: str(fd, 'fiscalYearStartMonth'),
    weekStartsOn: str(fd, 'weekStartsOn'),
    splitMode: str(fd, 'splitMode'),
    paymentReferenceTemplate: str(fd, 'paymentReferenceTemplate'),
  });
  if (!parsed.success) return zodToState(parsed.error);
  try {
    updateHousehold(parsed.data);
  } catch (e) {
    return { error: (e as Error).message };
  }
  revalidatePath('/', 'layout');
  return { ok: true };
}
