'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import type { ActionState } from '@/components/ui/form';
import { errorText, fieldErrors, str, zodToState } from '@/lib/actions';
import {
  auditDeveloper,
  authState,
  requireDeveloper,
  requireOwner,
  signOut,
} from '@/lib/auth/session';
import { replaceAlias } from '@/lib/bills-address';
import { getHousehold, updateHousehold } from '@/lib/households';
import { redirect } from 'next/navigation';
import { exitDemo } from '@/lib/demo';
import { isGlass, isTheme } from '@/lib/appearance';
import { ALLOWANCE_PERIODS, HOUSEHOLD_TYPES } from '@/db/schema';
import { parseMoneyToMinor } from '@/lib/format';
import { isHouseholdType } from '@/lib/household-types';
import { getAppearance, rememberAppearance } from '@/lib/auth/appearance';
import { setAccountAppearance } from '@/lib/accounts';
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
  type: z.enum(HOUSEHOLD_TYPES).nullable(),
  address: z.string().max(120),
  allowance: z.string(),
  allowancePeriod: z.enum(ALLOWANCE_PERIODS).catch('month'),
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
    type: str(fd, 'type') || null,
    address: str(fd, 'address'),
    allowance: str(fd, 'allowance'),
    allowancePeriod: str(fd, 'allowancePeriod') || 'month',
    paymentReferenceTemplate: str(fd, 'paymentReferenceTemplate'),
    membersCanExport: fd.get('membersCanExport') === 'on',
  });
  if (!parsed.success) return zodToState(parsed.error);
  const { address, allowance, ...rest } = parsed.data;
  const let_ = rest.type === 'investment_property';
  const allowanceMinor = let_ && allowance ? parseMoneyToMinor(allowance, rest.currency) : null;
  if (let_ && allowance && (allowanceMinor === null || allowanceMinor <= 0))
    return { fieldErrors: { allowance: (await errorText())('allowanceAmount') } };
  try {
    updateHousehold(me.householdId, {
      ...rest,
      address: let_ && address ? address : null,
      allowanceMinor,
    });
  } catch (e) {
    return { error: (e as Error).message };
  }
  revalidatePath('/', 'layout');
  return { ok: true };
}

/**
 * Light/dark and glass (Settings → Appearance). Saved on the account, so every
 * device and household follows; the demo keeps it in the browser only.
 */
export async function saveAppearanceAction(fd: FormData): Promise<void> {
  const s = await authState();
  if (s.kind !== 'ok') redirect('/');
  const current = await getAppearance();
  const theme = str(fd, 'theme');
  const glass = str(fd, 'glass');
  const next = {
    theme: isTheme(theme) ? theme : current.theme,
    glass: isGlass(glass) ? glass : current.glass,
  };
  if (s.account) setAccountAppearance(s.account.id, next);
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
  const me = await requireDeveloper();
  requestUpdate(me.name);
  await auditDeveloper('update.request');
  revalidatePath('/settings');
}

export async function cancelUpdateAction(): Promise<void> {
  await requireDeveloper();
  cancelUpdateRequest();
  await auditDeveloper('update.cancel');
  revalidatePath('/settings');
}

/** Skip the short cache and ask GitHub again. */
export async function recheckUpdateAction(): Promise<void> {
  await requireDeveloper();
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

/** Admin, once: what kind of household this is (SCOPE-accounts.md §7); the Home banner asks until it's set. */
export async function setHouseholdTypeAction(fd: FormData): Promise<void> {
  const me = await requireOwner();
  const type = str(fd, 'type');
  if (!isHouseholdType(type)) redirect('/');
  updateHousehold(me.householdId, { type });
  revalidatePath('/', 'layout');
  redirect('/');
}
