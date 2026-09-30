'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import type { ActionState } from '@/components/ui/form';
import { fieldErrors, str, zodToState } from '@/lib/actions';
import { requireMember, requireOperator, requireOwner, signOut } from '@/lib/auth/session';
import { replaceAlias } from '@/lib/bills-address';
import { getHousehold, updateHousehold } from '@/lib/households';
import { redirect } from 'next/navigation';
import { exitDemo } from '@/lib/demo';
import { isPreset, isTheme } from '@/lib/appearance';
import { rememberAppearance } from '@/lib/auth/appearance';
import { updateMember } from '@/lib/members';
import { cancelUpdateRequest, checkForUpdate, requestUpdate } from '@/lib/updates';
import { readMissingMetrics } from '@/ingest/metrics';
import { computeRegionalStats, regionalEnabled, setRegionalSharing } from '@/lib/regional';
import { clearHouseholdLocation, LocationError, setHouseholdLocation } from '@/lib/location';

const schema = z.object({
  name: z.string().min(1, 'required').max(60),
  currency: z.string().regex(/^[A-Za-z]{3}$/, 'currencyCode'),
  locale: z.string().min(2, 'required'),
  timezone: z
    .string()
    .refine((tz) => Intl.supportedValuesOf('timeZone').includes(tz), 'unknownTimezone'),
  fiscalYearStartMonth: z.coerce.number().int().min(1).max(12),
  weekStartsOn: z.coerce.number().int().min(0).max(6),
  splitMode: z.enum(['shared', 'single']),
  paymentReferenceTemplate: z.string().min(1, 'required').max(60),
  membersCanExport: z.boolean(),
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
    membersCanExport: fd.get('membersCanExport') === 'on',
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

/**
 * This person's colours (Settings → Appearance). Saved on the member, so every
 * device they sign in on follows; a field left out keeps its current value.
 */
export async function saveAppearanceAction(fd: FormData): Promise<void> {
  const me = await requireMember();
  const preset = str(fd, 'preset');
  const theme = str(fd, 'theme');
  const next = {
    preset: isPreset(preset) ? preset : me.appearancePreset,
    theme: isTheme(theme) ? theme : me.theme,
  };
  updateMember(me.householdId, me.id, { appearancePreset: next.preset, theme: next.theme });
  await rememberAppearance(next);
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

/** Read figures from bills that came in before they were kept (in the background). */
export async function readMissingMetricsAction(): Promise<void> {
  const me = await requireOwner();
  void readMissingMetrics(me.householdId)
    .then((r) =>
      console.log(
        `[metrics] ${me.householdId}: read ${r.read}, ${r.withFigures} with figures, ${r.dated} dated`,
      ),
    )
    .catch((e) => console.error('[metrics]', (e as Error).message));
  revalidatePath('/settings');
}

/** Where the household is (postcode and country, never an address). Admins only. */
export async function saveLocationAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const me = await requireOwner();
  const postalCode = str(fd, 'postalCode');
  if (!postalCode) return fieldErrors({ postalCode: 'pickPostcode' });
  try {
    setHouseholdLocation(me.householdId, {
      country: str(fd, 'country'),
      postalCode,
      locality: str(fd, 'locality') || null,
    });
  } catch (e) {
    if (e instanceof LocationError) return { fieldErrors: { postalCode: e.message } };
    throw e;
  }
  revalidatePath('/settings');
  revalidatePath('/');
  return { ok: true };
}

export async function removeLocationAction(): Promise<void> {
  const me = await requireOwner();
  clearHouseholdLocation(me.householdId);
  revalidatePath('/settings');
}

/** Area comparisons on or off (admins). Turning it off takes the household out of every figure now. */
export async function saveSharingAction(fd: FormData): Promise<void> {
  const me = await requireOwner();
  const share = fd.get('share') === 'on';
  setRegionalSharing(me.householdId, share, 'settings', me.id);
  if (!share && regionalEnabled()) computeRegionalStats();
  revalidatePath('/settings');
  revalidatePath('/');
}

/**
 * "Got it" on the dashboard notice that area comparisons are on. Only records
 * the acknowledgement while sharing is still on: a stale tab must not turn it
 * back on after another admin turned it off.
 */
export async function acknowledgeSharingAction(): Promise<void> {
  const me = await requireOwner();
  if (getHousehold(me.householdId)?.shareRegional)
    setRegionalSharing(me.householdId, true, 'acknowledged', me.id);
  revalidatePath('/');
}
