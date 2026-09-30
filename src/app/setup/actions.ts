'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';
import type { ActionState } from '@/components/ui/form';
import { membershipsFor } from '@/lib/accounts';
import { rememberAppearance } from '@/lib/auth/appearance';
import { requireAccount, setActiveMember } from '@/lib/auth/session';
import { DEFAULT_APPEARANCE, isPreset, isTheme } from '@/lib/appearance';
import { errorText, str, zodToState } from '@/lib/actions';
import { isIsoDate } from '@/lib/dates';
import { hasPostcodeData, lookupPostcode } from '@/lib/location';
import { setUpHousehold } from '@/lib/setup';

const schema = z
  .object({
    householdName: z.string().min(1, 'householdName').max(60),
    currency: z.string().regex(/^[A-Za-z]{3}$/, 'currencyCode'),
    locale: z.string().min(2, 'required'),
    timezone: z.string().min(1, 'required'),
    fiscalYearStartMonth: z.coerce.number().int().min(1).max(12),
    splitMode: z.enum(['shared', 'single']),
    ownerName: z.string().min(1, 'yourName').max(40),
    activeFrom: z.string().refine(isIsoDate, 'validDate'),
    colour: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'required'),
  })
  .refine((v) => Intl.supportedValuesOf('timeZone').includes(v.timezone), {
    path: ['timezone'],
    message: 'unknownTimezone',
  });

export async function completeSetup(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const account = await requireAccount();
  if (membershipsFor(account.id).length) redirect('/');
  const parsed = schema.safeParse({
    householdName: str(fd, 'householdName'),
    currency: str(fd, 'currency'),
    locale: str(fd, 'locale'),
    timezone: str(fd, 'timezone'),
    fiscalYearStartMonth: str(fd, 'fiscalYearStartMonth'),
    splitMode: str(fd, 'splitMode'),
    ownerName: str(fd, 'ownerName'),
    activeFrom: str(fd, 'activeFrom'),
    colour: str(fd, 'colour'),
  });
  if (!parsed.success) return zodToState(parsed.error);
  const v = parsed.data;
  // Optional: country + postcode (checked before anything is created).
  const location = {
    country: str(fd, 'country'),
    postalCode: str(fd, 'postalCode'),
    locality: str(fd, 'locality') || null,
  };
  if (
    location.postalCode &&
    hasPostcodeData(location.country) &&
    !lookupPostcode(location.country, location.postalCode)
  )
    return {
      fieldErrors: {
        postalCode: (await errorText())('unknownPostcode', { postcode: location.postalCode }),
      },
    };
  // The colours are theirs alone (§4a): a preset and light/dark, Harbour and automatic unless chosen.
  const preset = str(fd, 'preset');
  const theme = str(fd, 'theme');
  const appearance = {
    preset: isPreset(preset) ? preset : DEFAULT_APPEARANCE.preset,
    theme: isTheme(theme) ? theme : DEFAULT_APPEARANCE.theme,
  };
  let ownerId: string;
  try {
    ownerId = setUpHousehold(account, {
      household: {
        name: v.householdName,
        currency: v.currency,
        locale: v.locale,
        timezone: v.timezone,
        fiscalYearStartMonth: v.fiscalYearStartMonth,
        splitMode: v.splitMode,
      },
      owner: { name: v.ownerName, activeFrom: v.activeFrom, colour: v.colour, appearance },
      location: location.postalCode ? location : null,
      shareRegional: fd.get('shareRegional') === 'on',
    }).ownerId;
  } catch (e) {
    return { error: (e as Error).message };
  }
  await setActiveMember(ownerId);
  await rememberAppearance(appearance);
  redirect('/set-pin');
}
