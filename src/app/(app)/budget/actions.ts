'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import type { ActionState } from '@/components/ui/form';
import { CADENCES, type Cadence } from '@/db/schema';
import { str } from '@/lib/actions';
import { requireMember, requireOwner } from '@/lib/auth/session';
import { budgetYear, setBudget } from '@/lib/budget';
import { todayIn } from '@/lib/dates';
import { parseMoneyToMinor } from '@/lib/format';
import { getHousehold } from '@/lib/households';
import { createService, listServiceTypes } from '@/lib/services';

/** The household's yearly budget for the current year (admins). Blank clears it. */
export async function saveBudgetAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const me = await requireOwner();
  const hh = getHousehold(me.householdId)!;
  const t = await getTranslations('budget.edit');
  const raw = str(fd, 'amount').trim();
  const year = budgetYear(hh, todayIn(hh.timezone));
  if (fd.get('clear') === '1' || raw === '') {
    setBudget(hh.id, year.key, null);
  } else {
    const minor = parseMoneyToMinor(raw, hh.currency);
    if (minor === null || minor <= 0) return { fieldErrors: { amount: t('invalid') } };
    setBudget(hh.id, year.key, minor);
  }
  revalidatePath('/budget');
  redirect('/budget');
}

/** A yearly bill added by hand (SCOPE-redesign-2.md §5 quick-add): a service with its usual amount and when it falls. */
export async function addYearlyBillAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const me = await requireMember();
  const hh = getHousehold(me.householdId)!;
  const t = await getTranslations('budget.quick');
  const te = await getTranslations('budget.edit');
  const name = str(fd, 'name').trim().replace(/\s+/g, ' ');
  const errors: Record<string, string> = {};
  if (!name) errors.name = t('name');
  const minor = parseMoneyToMinor(str(fd, 'amount').trim(), hh.currency);
  if (minor === null || minor <= 0) errors.amount = te('invalid');
  const cadence = str(fd, 'cadence') as Cadence;
  if (!(CADENCES as readonly string[]).includes(cadence) || cadence === 'irregular')
    errors.cadence = t('cadence');
  const when = str(fd, 'when');
  if (!/^\d{4}-\d{2}$/.test(when)) errors.when = t('when');
  const typeSlug = str(fd, 'type');
  if (!listServiceTypes().some((ty) => ty.slug === typeSlug)) errors.type = t('name');
  if (Object.keys(errors).length) return { fieldErrors: errors };
  createService(hh.id, {
    typeSlug,
    name,
    provider: name,
    cadence,
    recurring: false,
    expectedAmountMinor: minor,
    // Roughly when: the middle of the month named.
    expectedOn: `${when}-15`,
  });
  revalidatePath('/budget');
  revalidatePath('/services');
  revalidatePath('/bills');
  revalidatePath('/');
  return { ok: true, note: t('added') };
}
