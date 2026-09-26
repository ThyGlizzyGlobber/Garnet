'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import type { ActionState } from '@/components/ui/form';
import { optStr, str, zodToState } from '@/lib/actions';
import { requireMember } from '@/lib/auth/session';
import {
  createBill,
  deleteBill,
  getBill,
  setBillPaidToProvider,
  setSharePaid,
  updateBill,
  type BillInput,
} from '@/lib/bills';
import { isIsoDate } from '@/lib/dates';
import { parseMoneyToMinor } from '@/lib/format';
import { getHousehold } from '@/lib/households';

const isoDate = z.string().refine(isIsoDate, 'Use a valid date');

const schema = z
  .object({
    serviceId: z.string().min(1, 'Choose a service'),
    amount: z.string().min(1, 'Enter the amount'),
    tax: z.string(),
    taxLabel: z.string(),
    periodStart: isoDate,
    periodEnd: isoDate,
    issueDate: z.string(),
    dueDate: isoDate,
    usageQuantity: z.string(),
    usageUnit: z.string(),
    externalRef: z.string(),
    notes: z.string(),
    paidToProvider: z.boolean(),
  })
  .refine((v) => v.periodEnd >= v.periodStart, {
    path: ['periodEnd'],
    message: 'Period end is before its start',
  })
  .refine((v) => v.issueDate === '' || isIsoDate(v.issueDate), {
    path: ['issueDate'],
    message: 'Use a valid date',
  });

function read(fd: FormData) {
  return schema.safeParse({
    serviceId: str(fd, 'serviceId'),
    amount: str(fd, 'amount'),
    tax: str(fd, 'tax'),
    taxLabel: str(fd, 'taxLabel'),
    periodStart: str(fd, 'periodStart'),
    periodEnd: str(fd, 'periodEnd'),
    issueDate: str(fd, 'issueDate'),
    dueDate: str(fd, 'dueDate'),
    usageQuantity: str(fd, 'usageQuantity'),
    usageUnit: str(fd, 'usageUnit'),
    externalRef: str(fd, 'externalRef'),
    notes: str(fd, 'notes'),
    paidToProvider: fd.get('paidToProvider') === 'on',
  });
}

function toInput(
  v: z.infer<typeof schema>,
  currency: string,
): Omit<BillInput, 'source'> | { fieldErrors: Record<string, string> } {
  const amountMinor = parseMoneyToMinor(v.amount, currency);
  if (amountMinor === null || amountMinor < 0)
    return { fieldErrors: { amount: 'Enter a valid amount' } };
  const taxMinor = v.tax ? parseMoneyToMinor(v.tax, currency) : null;
  if (v.tax && taxMinor === null) return { fieldErrors: { tax: 'Enter a valid amount' } };
  const usage = v.usageQuantity ? Number(v.usageQuantity) : null;
  if (v.usageQuantity && !Number.isFinite(usage))
    return { fieldErrors: { usageQuantity: 'Enter a number' } };
  return {
    serviceId: v.serviceId,
    amountMinor,
    currency,
    taxMinor,
    taxLabel: v.taxLabel || null,
    periodStart: v.periodStart,
    periodEnd: v.periodEnd,
    issueDate: v.issueDate || null,
    dueDate: v.dueDate,
    usageQuantity: usage,
    usageUnit: v.usageUnit || null,
    externalRef: v.externalRef || null,
    notes: v.notes || null,
    paidToProviderAt: v.paidToProvider ? new Date().toISOString() : null,
  };
}

export async function createBillAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const me = await requireMember();
  const hh = getHousehold(me.householdId)!;
  const parsed = read(fd);
  if (!parsed.success) return zodToState(parsed.error);
  const input = toInput(parsed.data, hh.currency);
  if ('fieldErrors' in input)
    return { error: 'Please fix the highlighted fields.', fieldErrors: input.fieldErrors };
  let id: string;
  try {
    id = createBill(hh.id, { ...input, source: 'manual', createdByMemberId: me.id }).id;
  } catch (e) {
    return { error: (e as Error).message };
  }
  revalidatePath('/bills');
  redirect(`/bills/${id}`);
}

export async function updateBillAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const me = await requireMember();
  const hh = getHousehold(me.householdId)!;
  const id = str(fd, 'id');
  const existing = getBill(hh.id, id);
  if (!existing) return { error: 'Bill not found' };
  const parsed = read(fd);
  if (!parsed.success) return zodToState(parsed.error);
  const input = toInput(parsed.data, hh.currency);
  if ('fieldErrors' in input)
    return { error: 'Please fix the highlighted fields.', fieldErrors: input.fieldErrors };
  try {
    // Keep the original paid timestamp if it was already paid and still is.
    const paidToProviderAt = input.paidToProviderAt
      ? (existing.paidToProviderAt ?? input.paidToProviderAt)
      : null;
    updateBill(hh.id, id, { ...input, paidToProviderAt });
  } catch (e) {
    return { error: (e as Error).message };
  }
  revalidatePath('/bills');
  redirect(`/bills/${id}`);
}

export async function deleteBillAction(fd: FormData): Promise<void> {
  const me = await requireMember();
  deleteBill(me.householdId, str(fd, 'id'));
  revalidatePath('/bills');
  redirect('/bills');
}

export async function toggleSharePaidAction(fd: FormData): Promise<void> {
  const me = await requireMember();
  const shareId = str(fd, 'shareId');
  const paid = str(fd, 'paid') === 'true';
  setSharePaid(me.householdId, shareId, paid, {
    markedByMemberId: me.id,
    method: optStr(fd, 'method') ?? 'transfer',
  });
  revalidatePath(`/bills/${str(fd, 'billId')}`);
  revalidatePath('/bills');
}

export async function toggleBillPaidAction(fd: FormData): Promise<void> {
  const me = await requireMember();
  const id = str(fd, 'id');
  setBillPaidToProvider(me.householdId, id, str(fd, 'paid') === 'true');
  revalidatePath(`/bills/${id}`);
  revalidatePath('/bills');
}
