'use server';

import { answerOwnership, asksMember, canChangeOwner } from '@/lib/ownership';
import { rotateDocument } from '@/ingest/rotate';
import { getReviewItem } from '@/lib/review';
import { refileDocuments } from '@/lib/filing';
import type { Member } from '@/db/schema';
import { visibleTo } from '@/lib/scope';
import { getService } from '@/lib/services';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import type { ActionState } from '@/components/ui/form';
import { optStr, str, zodToState } from '@/lib/actions';
import { requireMember } from '@/lib/auth/session';
import {
  clearBillAlert,
  createBill,
  getBill,
  setBillPaidToProvider,
  setInstalmentPaid,
  setPaymentPlan,
  setSharePaid,
  updateBill,
  type BillInput,
} from '@/lib/bills';
import { deleteBillWithDocument } from '@/ingest/archive';
import { isIsoDate } from '@/lib/dates';
import { parseMoneyToMinor } from '@/lib/format';
import { getHousehold } from '@/lib/households';
import { notifyBillCreated, notifyInBackground } from '@/lib/notifications';

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

/** A bill this member may see and act on: another member's personal bill is not found. */
function visibleBill(me: Member, id: string) {
  const b = getBill(me.householdId, id);
  return b && visibleTo(b.ownerMemberId, me.id) ? b : null;
}

function visibleService(me: Member, id: string) {
  const s = getService(me.householdId, id);
  return s && visibleTo(s.ownerMemberId, me.id) ? s : null;
}

export async function createBillAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const me = await requireMember();
  const hh = getHousehold(me.householdId)!;
  const parsed = read(fd);
  if (!parsed.success) return zodToState(parsed.error);
  const input = toInput(parsed.data, hh.currency);
  if ('fieldErrors' in input)
    return { error: 'Please fix the highlighted fields.', fieldErrors: input.fieldErrors };
  if (!visibleService(me, input.serviceId)) return { error: 'Service not found' };
  let id: string;
  try {
    id = createBill(hh.id, { ...input, source: 'manual', createdByMemberId: me.id }).id;
    notifyInBackground(notifyBillCreated(hh.id, id, { except: me.id }));
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
  const existing = visibleBill(me, id);
  if (!existing) return { error: 'Bill not found' };
  const parsed = read(fd);
  if (!parsed.success) return zodToState(parsed.error);
  const input = toInput(parsed.data, hh.currency);
  if ('fieldErrors' in input)
    return { error: 'Please fix the highlighted fields.', fieldErrors: input.fieldErrors };
  if (!visibleService(me, input.serviceId)) return { error: 'Service not found' };
  try {
    // Keep the original paid timestamp if it was already paid and still is.
    const paidToProviderAt = input.paidToProviderAt
      ? (existing.paidToProviderAt ?? input.paidToProviderAt)
      : null;
    updateBill(hh.id, id, { ...input, paidToProviderAt });
    // A new date or service can mean a new folder for its files.
    refileDocuments(hh.id);
  } catch (e) {
    return { error: (e as Error).message };
  }
  revalidatePath('/bills');
  redirect(`/bills/${id}`);
}

export async function deleteBillAction(fd: FormData): Promise<void> {
  const me = await requireMember();
  if (visibleBill(me, str(fd, 'id'))) deleteBillWithDocument(me.householdId, str(fd, 'id'));
  revalidatePath('/bills');
  revalidatePath('/review');
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
  if (!visibleBill(me, id)) return;
  setBillPaidToProvider(me.householdId, id, str(fd, 'paid') === 'true');
  revalidatePath(`/bills/${id}`);
  revalidatePath('/bills');
}

/** "Sorted": the household has dealt with a provider's payment-failed or overdue notice. */
export async function clearBillAlertAction(fd: FormData): Promise<void> {
  const me = await requireMember();
  const id = str(fd, 'id');
  if (!visibleBill(me, id)) return;
  clearBillAlert(me.householdId, id);
  revalidatePath(`/bills/${id}`);
  revalidatePath('/bills');
  revalidatePath('/');
}

/** Pay a bill in full or by the instalments it offers: the service's payer or an admin chooses. */
export async function setPaymentPlanAction(fd: FormData): Promise<void> {
  const me = await requireMember();
  const id = str(fd, 'id');
  const plan = str(fd, 'plan');
  const b = visibleBill(me, id);
  if (!b || (plan !== 'full' && plan !== 'instalments')) return;
  if (me.role !== 'owner' && b.service.payerMemberId !== me.id) return;
  try {
    setPaymentPlan(me.householdId, id, plan);
  } catch (e) {
    // The page only offers the switch while it's allowed; a race changes nothing.
    console.warn('[bills] payment plan:', (e as Error).message);
  }
  revalidatePath(`/bills/${id}`);
  revalidatePath('/bills');
  revalidatePath('/');
}

export async function toggleInstalmentPaidAction(fd: FormData): Promise<void> {
  const me = await requireMember();
  const id = str(fd, 'id');
  if (!visibleBill(me, id)) return;
  setInstalmentPaid(me.householdId, id, Number(str(fd, 'seq')), str(fd, 'paid') === 'true');
  revalidatePath(`/bills/${id}`);
  revalidatePath('/bills');
  revalidatePath('/');
}

/** Turn a bill's scan or photo a quarter turn clockwise, for good (see src/ingest/rotate.ts). */
export async function rotateDocumentAction(fd: FormData): Promise<void> {
  const me = await requireMember();
  const billId = str(fd, 'billId');
  if (!visibleBill(me, billId)) return;
  // Only a file that belongs with this bill (its source, a receipt, a notice).
  const doc = getReviewItem(me.householdId, str(fd, 'id'), undefined, { viewer: me.id });
  if (!doc || doc.linkedBillId !== billId) return;
  try {
    await rotateDocument(me.householdId, doc.id, 90);
  } catch (e) {
    console.warn('[bills] turn page:', (e as Error).message);
  }
  revalidatePath(`/bills/${billId}`);
}

/** "Who's this for?": the member who brought the bill in says whether its service is theirs. */
export async function answerOwnershipAction(fd: FormData): Promise<void> {
  const me = await requireMember();
  const billId = str(fd, 'billId');
  const b = visibleBill(me, billId);
  const answer = str(fd, 'answer');
  if (!b || (answer !== 'mine' && answer !== 'household') || !asksMember(b.service, me)) return;
  answerOwnership(me.householdId, b.serviceId, me, answer);
  revalidatePath(`/bills/${billId}`);
  revalidatePath('/bills');
  revalidatePath('/');
}

/** One tap on the bill page: make its service just mine, or the household's again. */
export async function setWhoseAction(fd: FormData): Promise<void> {
  const me = await requireMember();
  const billId = str(fd, 'billId');
  const b = visibleBill(me, billId);
  const whose = str(fd, 'whose');
  if (!b || (whose !== 'mine' && whose !== 'household')) return;
  if (!canChangeOwner(me, b.service) && !asksMember(b.service, me)) return;
  answerOwnership(me.householdId, b.serviceId, me, whose);
  // Its files move folder ("… (Mum, personal)" or back).
  refileDocuments(me.householdId);
  revalidatePath(`/bills/${billId}`);
  revalidatePath('/bills');
  revalidatePath('/services');
  revalidatePath('/');
}
