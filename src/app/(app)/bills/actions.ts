'use server';

import { answerOwnership, asksMember, mayChangeOwner, mayMoveBill } from '@/lib/ownership';
import { rotateDocument } from '@/ingest/rotate';
import { getReviewItem } from '@/lib/review';
import { refileDocuments } from '@/lib/filing';
import type { Member } from '@/db/schema';
import { visibleTo } from '@/lib/scope';
import { getService, listServiceTypes } from '@/lib/services';
import { fileBillUnder } from '@/lib/assets';
import { assetKindOf } from '@/lib/service-categories';
import { setRecurring } from '@/lib/recurring';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import type { ActionState } from '@/components/ui/form';
import { errorText, fieldErrors, optStr, str, zodToState } from '@/lib/actions';
import { requireMember } from '@/lib/auth/session';
import {
  clearBillAlert,
  createBill,
  getBill,
  moveBill,
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
import { canChoosePlan } from '@/lib/instalments';

const isoDate = z.string().refine(isIsoDate, 'validDate');

const schema = z
  .object({
    serviceId: z.string().min(1, 'chooseService'),
    amount: z.string().min(1, 'enterAmount'),
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
    message: 'periodOrder',
  })
  .refine((v) => v.issueDate === '' || isIsoDate(v.issueDate), {
    path: ['issueDate'],
    message: 'validDate',
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
  if (amountMinor === null || amountMinor < 0) return { fieldErrors: { amount: 'validAmount' } };
  const taxMinor = v.tax ? parseMoneyToMinor(v.tax, currency) : null;
  if (v.tax && taxMinor === null) return { fieldErrors: { tax: 'validAmount' } };
  const usage = v.usageQuantity ? Number(v.usageQuantity) : null;
  if (v.usageQuantity && !Number.isFinite(usage))
    return { fieldErrors: { usageQuantity: 'enterNumber' } };
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
  if ('fieldErrors' in input) return fieldErrors(input.fieldErrors);
  if (!visibleService(me, input.serviceId))
    return { error: (await errorText())('serviceNotFound') };
  let id: string;
  try {
    id = createBill(hh.id, { ...input, source: 'manual', createdByMemberId: me.id }).id;
    // For its vehicle or policy (moving to its side). The bill stands either
    // way; if it can't be filed there it waits under "No vehicle yet".
    const assetId = str(fd, 'assetId');
    if (assetId)
      try {
        fileBillUnder(hh.id, id, { assetId }, { me });
      } catch {
        // Its page offers the choice again.
      }
    applyRecurring(me, input.serviceId, fd);
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
  const te = await errorText();
  if (!existing) return { error: te('billNotFound') };
  const parsed = read(fd);
  if (!parsed.success) return zodToState(parsed.error);
  const input = toInput(parsed.data, hh.currency);
  if ('fieldErrors' in input) return fieldErrors(input.fieldErrors);
  const target = visibleService(me, input.serviceId);
  if (!target) return { error: te('serviceNotFound') };
  // Moving it to another service: the same rule as "Move to" on the bill page.
  const moving = target.id !== existing.serviceId;
  if (moving && !mayMoveBill(hh.id, me, existing, target))
    return {
      fieldErrors: { serviceId: te('moveNotAllowed') },
    };
  try {
    if (moving) moveBill(hh.id, id, target.id);
    applyRecurring(me, target.id, fd);
    // Keep the original paid timestamp if it was already paid and still is.
    const paidToProviderAt = input.paidToProviderAt
      ? (existing.paidToProviderAt ?? input.paidToProviderAt)
      : null;
    updateBill(hh.id, id, { ...input, paidToProviderAt });
    // Its vehicle or policy, when the form asked (a Vehicles or Health service).
    const assetId = fd.has('assetId') ? str(fd, 'assetId') || null : undefined;
    if (assetId !== undefined && assetId !== getBill(hh.id, id)?.assetId)
      fileBillUnder(hh.id, id, { assetId }, { me });
    // "Whose is it?": switches the whole service (and its bills) when changed.
    // Not asked when a vehicle or policy decides it.
    const whose = assetId ? '' : str(fd, 'whose');
    const svc = getService(hh.id, input.serviceId);
    if (
      svc &&
      (whose === 'mine' || whose === 'household') &&
      (whose === 'mine') !== !!svc.ownerMemberId &&
      mayChangeOwner(hh.id, me, svc)
    ) {
      const r = answerOwnership(hh.id, svc.id, me, whose);
      if (!r.ok && r.reason !== 'not-found') return { error: r.reason ?? te('whoseFailed') };
      revalidatePath('/');
      revalidatePath('/services');
    }
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
  revalidatePath('/inbox');
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
  if (!canChoosePlan(me, b)) return;
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
  if (!mayChangeOwner(me.householdId, me, b.service)) return;
  answerOwnership(me.householdId, b.serviceId, me, whose);
  // Its files move folder ("… (Mum, personal)" or back).
  refileDocuments(me.householdId);
  revalidatePath(`/bills/${billId}`);
  revalidatePath('/bills');
  revalidatePath('/services');
  revalidatePath('/');
}

/** "Move to": file a bill under another service or sub-service (see moveBill). */
export async function moveBillAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const me = await requireMember();
  const id = str(fd, 'id');
  const te = await errorText();
  const b = visibleBill(me, id);
  if (!b) return { error: te('billNotFound') };
  // svc:<id> (older forms send serviceId), or type:<slug> for a Vehicles or
  // Health sub-service not set up yet; with the vehicle or policy picked.
  const raw = str(fd, 'target') || `svc:${str(fd, 'serviceId')}`;
  const assetId = str(fd, 'assetId') || null;
  let to: string | null = null;
  try {
    if (raw.startsWith('type:')) {
      const type = listServiceTypes().find((ty) => ty.slug === raw.slice(5));
      if (!type || !assetKindOf(type.category)) return { error: te('serviceNotFound') };
      to = fileBillUnder(me.householdId, id, { assetId, typeSlug: type.slug }, { me }).serviceId;
    } else {
      const target = visibleService(me, raw.slice(4));
      if (!target) return { error: te('serviceNotFound') };
      if (assetId && assetKindOf(target.type.category)) {
        // The vehicle decides the side: the picked service when it's on it.
        to = fileBillUnder(
          me.householdId,
          id,
          { assetId, typeSlug: target.typeSlug, serviceId: target.id },
          { me },
        ).serviceId;
      } else {
        if (!mayMoveBill(me.householdId, me, b, target)) return { error: te('moveNotAllowed') };
        moveBill(me.householdId, id, target.id);
        if (b.assetId) fileBillUnder(me.householdId, id, { assetId: null });
        to = target.id;
      }
    }
    // Its files move to the new service's folder.
    refileDocuments(me.householdId);
  } catch (e) {
    return { error: (e as Error).message };
  }
  revalidatePath('/bills');
  revalidatePath('/services', 'layout');
  revalidatePath(`/services/${b.serviceId}`);
  if (to) revalidatePath(`/services/${to}`);
  revalidatePath('/');
  redirect(`/bills/${id}`);
}

/** The bill form's "Recurring" switch applies to the bill's service when it changed. */
function applyRecurring(me: Member, serviceId: string, fd: FormData) {
  if (!fd.get('recurringShown')) return;
  const svc = visibleService(me, serviceId);
  const on = fd.get('recurring') === 'on';
  if (!svc || svc.cadence === 'irregular' || on === !!svc.recurringSince) return;
  setRecurring(me.householdId, svc.id, on);
  revalidatePath(`/services/${svc.id}`);
}
