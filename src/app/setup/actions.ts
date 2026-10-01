'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';
import type { ActionState } from '@/components/ui/form';
import { markUnlocked, requireAccount, setActiveMember } from '@/lib/auth/session';
import { errorText, str, zodToState } from '@/lib/actions';
import { isIsoDate } from '@/lib/dates';
import { hasPostcodeData, lookupPostcode } from '@/lib/location';
import { setUpHousehold } from '@/lib/setup';
import { ALLOWANCE_PERIODS, HOUSEHOLD_TYPES } from '@/db/schema';
import { parseMoneyToMinor } from '@/lib/format';
import { splitModeFor } from '@/lib/household-types';

const schema = z
  .object({
    householdName: z.string().min(1, 'householdName').max(60),
    currency: z.string().regex(/^[A-Za-z]{3}$/, 'currencyCode'),
    locale: z.string().min(2, 'required'),
    timezone: z.string().min(1, 'required'),
    fiscalYearStartMonth: z.coerce.number().int().min(1).max(12),
    type: z.enum(HOUSEHOLD_TYPES),
    address: z.string().max(120),
    utilities: z.enum(['no', 'yes']).catch('no'),
    allowance: z.string(),
    allowancePeriod: z.enum(ALLOWANCE_PERIODS).catch('month'),
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
  const parsed = schema.safeParse({
    householdName: str(fd, 'householdName'),
    currency: str(fd, 'currency'),
    locale: str(fd, 'locale'),
    timezone: str(fd, 'timezone'),
    fiscalYearStartMonth: str(fd, 'fiscalYearStartMonth'),
    type: str(fd, 'type'),
    address: str(fd, 'address'),
    utilities: str(fd, 'utilities'),
    allowance: str(fd, 'allowance'),
    allowancePeriod: str(fd, 'allowancePeriod'),
    ownerName: str(fd, 'ownerName'),
    activeFrom: str(fd, 'activeFrom'),
    colour: str(fd, 'colour'),
  });
  if (!parsed.success) return zodToState(parsed.error);
  const v = parsed.data;
  // A let property with utilities in the rent: the allowance (D17).
  const let_ = v.type === 'investment_property';
  const allowanceMinor =
    let_ && v.utilities === 'yes' ? parseMoneyToMinor(v.allowance, v.currency.toUpperCase()) : null;
  if (let_ && v.utilities === 'yes' && (allowanceMinor === null || allowanceMinor <= 0))
    return { fieldErrors: { allowance: (await errorText())('allowanceAmount') } };
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
  let ownerId: string;
  try {
    ownerId = setUpHousehold(account, {
      household: {
        name: v.householdName,
        currency: v.currency,
        locale: v.locale,
        timezone: v.timezone,
        fiscalYearStartMonth: v.fiscalYearStartMonth,
        type: v.type,
        splitMode: splitModeFor(v.type),
        address: let_ && v.address ? v.address : null,
        allowanceMinor,
        allowancePeriod: v.allowancePeriod,
      },
      owner: { name: v.ownerName, activeFrom: v.activeFrom, colour: v.colour },
      location: location.postalCode ? location : null,
      shareRegional: fd.get('shareRegional') === 'on',
    }).ownerId;
  } catch (e) {
    return { error: (e as Error).message };
  }
  await setActiveMember(ownerId);
  if (!account.pinHash) redirect('/set-pin');
  await markUnlocked(ownerId);
  redirect('/');
}
