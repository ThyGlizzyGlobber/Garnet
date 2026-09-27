'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import type { ActionState } from '@/components/ui/form';
import { str, zodToState } from '@/lib/actions';
import { requireMember, requireOperator, requireOwner, signOut } from '@/lib/auth/session';
import { replaceAlias } from '@/lib/bills-address';
import { getHousehold, updateHousehold } from '@/lib/households';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { exitDemo } from '@/lib/demo';
import { requestIsHttps } from '@/lib/request';
import { THEME_COOKIE, THEMES, type Theme } from '@/lib/theme';
import { cancelUpdateRequest, checkForUpdate, requestUpdate } from '@/lib/updates';

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
  const me = await requireOwner();
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
    updateHousehold(me.householdId, parsed.data);
  } catch (e) {
    return { error: (e as Error).message };
  }
  revalidatePath('/', 'layout');
  return { ok: true };
}

/** Per-browser theme choice; any member can set it. */
export async function setThemeAction(fd: FormData): Promise<void> {
  await requireMember();
  const v = str(fd, 'theme');
  const theme: Theme = (THEMES as readonly string[]).includes(v) ? (v as Theme) : 'auto';
  const jar = await cookies();
  if (theme === 'auto') jar.delete(THEME_COOKIE);
  else
    jar.set(THEME_COOKIE, theme, {
      path: '/',
      maxAge: 60 * 60 * 24 * 365,
      sameSite: 'lax',
      secure: await requestIsHttps(),
    });
  revalidatePath('/', 'layout');
}

/** Owner only: wipe the fictional household and start the real setup wizard. */
export async function exitDemoAction(): Promise<void> {
  const me = await requireOwner();
  exitDemo(me.householdId);
  await signOut();
  redirect('/login');
}

/** Owner only: queue an update for the NAS cron job to apply. */
export async function requestUpdateAction(): Promise<void> {
  const me = await requireOperator();
  requestUpdate(me.name);
  revalidatePath('/settings');
}

export async function cancelUpdateAction(): Promise<void> {
  await requireOperator();
  cancelUpdateRequest();
  revalidatePath('/settings');
}

/** Skip the short cache and ask GitHub again. */
export async function recheckUpdateAction(): Promise<void> {
  await requireOperator();
  await checkForUpdate({ fresh: true });
  revalidatePath('/settings');
}

/** Admin: give the household a new bills address; the old one stops working. */
export async function replaceBillsAddressAction(): Promise<void> {
  const me = await requireOwner();
  const hh = getHousehold(me.householdId);
  if (hh) replaceAlias(hh);
  revalidatePath('/settings');
}
