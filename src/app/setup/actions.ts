'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';
import type { ActionState } from '@/components/ui/form';
import { membershipsFor } from '@/lib/accounts';
import { requireAccount, setActiveMember } from '@/lib/auth/session';
import { str, zodToState } from '@/lib/actions';
import { getDb } from '@/db/client';
import { isIsoDate } from '@/lib/dates';
import { createHousehold } from '@/lib/households';
import { hasPostcodeData, lookupPostcode, setHouseholdLocation } from '@/lib/location';
import { createMember } from '@/lib/members';
import { setRegionalSharing } from '@/lib/regional';

const schema = z
  .object({
    householdName: z.string().min(1, 'Give your household a name').max(60),
    currency: z.string().regex(/^[A-Za-z]{3}$/, 'Use a 3-letter currency code'),
    locale: z.string().min(2, 'Required'),
    timezone: z.string().min(1, 'Required'),
    fiscalYearStartMonth: z.coerce.number().int().min(1).max(12),
    splitMode: z.enum(['shared', 'single']),
    ownerName: z.string().min(1, 'Your name is required').max(40),
    activeFrom: z.string().refine(isIsoDate, 'Use a valid date'),
  })
  .refine((v) => Intl.supportedValuesOf('timeZone').includes(v.timezone), {
    path: ['timezone'],
    message: 'Unknown timezone',
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
        postalCode: `We don't know postcode ${location.postalCode}. Try your suburb or town instead.`,
      },
    };
  let ownerId: string;
  try {
    ownerId = getDb().transaction((tx) => {
      // Re-checked inside the transaction so two tabs can't create two households.
      if (membershipsFor(account.id, tx).length) throw new Error('You already have a household.');
      const hh = createHousehold(
        {
          name: v.householdName,
          currency: v.currency,
          locale: v.locale,
          timezone: v.timezone,
          fiscalYearStartMonth: v.fiscalYearStartMonth,
          splitMode: v.splitMode,
        },
        tx,
      );
      if (location.postalCode) setHouseholdLocation(hh.id, location, tx);
      const owner = createMember(
        hh.id,
        {
          name: v.ownerName,
          role: 'owner',
          activeFrom: v.activeFrom,
          accountId: account.id,
          email: account.email,
        },
        tx,
      );
      // Area comparisons: on unless unticked; recorded with the notice version.
      const share = fd.get('shareRegional') === 'on';
      setRegionalSharing(hh.id, share, share ? 'default' : 'settings', owner.id, tx);
      return owner.id;
    });
  } catch (e) {
    return { error: (e as Error).message };
  }
  await setActiveMember(ownerId);
  redirect('/set-pin');
}
