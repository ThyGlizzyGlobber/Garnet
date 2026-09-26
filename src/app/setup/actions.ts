'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';
import type { ActionState } from '@/components/ui/form';
import { hashPin, PIN_PATTERN } from '@/lib/auth/pin';
import { loginAs } from '@/lib/auth/session';
import { str, zodToState } from '@/lib/actions';
import { getDb } from '@/db/client';
import { isIsoDate } from '@/lib/dates';
import { createHousehold, isSetUp } from '@/lib/households';
import { createMember } from '@/lib/members';

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
    pin: z.string().regex(PIN_PATTERN, 'PIN must be 4–8 digits'),
    pinConfirm: z.string(),
  })
  .refine((v) => v.pin === v.pinConfirm, { path: ['pinConfirm'], message: 'PINs do not match' })
  .refine((v) => Intl.supportedValuesOf('timeZone').includes(v.timezone), {
    path: ['timezone'],
    message: 'Unknown timezone',
  });

export async function completeSetup(_prev: ActionState, fd: FormData): Promise<ActionState> {
  if (isSetUp()) redirect('/');
  const parsed = schema.safeParse({
    householdName: str(fd, 'householdName'),
    currency: str(fd, 'currency'),
    locale: str(fd, 'locale'),
    timezone: str(fd, 'timezone'),
    fiscalYearStartMonth: str(fd, 'fiscalYearStartMonth'),
    splitMode: str(fd, 'splitMode'),
    ownerName: str(fd, 'ownerName'),
    activeFrom: str(fd, 'activeFrom'),
    pin: str(fd, 'pin'),
    pinConfirm: str(fd, 'pinConfirm'),
  });
  if (!parsed.success) return zodToState(parsed.error);
  const v = parsed.data;
  let ownerId: string;
  try {
    const pinHash = await hashPin(v.pin);
    ownerId = getDb().transaction((tx) => {
      // First-run only; re-checked inside the transaction so two tabs can't both create one.
      if (isSetUp(tx)) throw new Error('This server is already set up.');
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
      return createMember(
        hh.id,
        { name: v.ownerName, pinHash, role: 'owner', activeFrom: v.activeFrom },
        tx,
      ).id;
    });
  } catch (e) {
    return { error: (e as Error).message };
  }
  await loginAs(ownerId);
  redirect('/');
}
