'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import type { ActionState } from '@/components/ui/form';
import { approveDocument } from '@/ingest/approve';
import { archiveDocument, getDocument, setDocumentStatus } from '@/ingest/archive';
import { processDocument } from '@/ingest/pipeline';
import { errorText, fieldErrors, str, zodToState } from '@/lib/actions';
import { requireMember, requireOperator } from '@/lib/auth/session';
import { isIsoDate } from '@/lib/dates';
import { parseMoneyToMinor } from '@/lib/format';
import { getHousehold } from '@/lib/households';
import { rateLimit } from '@/lib/rate-limit';
import { getReviewItem, listDocuments } from '@/lib/review';
import { visibleTo } from '@/lib/scope';
import { getService } from '@/lib/services';
import { pollNow } from '@/worker';

/** Uploads a household may make per hour (sign-up is open; files are kept for good). */
const UPLOADS_PER_HOUR = 60;

const isoDate = z.string().refine(isIsoDate, 'validDate');
const approveSchema = z
  .object({
    documentId: z.string().min(1),
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
  })
  .refine((v) => v.periodEnd >= v.periodStart, {
    path: ['periodEnd'],
    message: 'periodOrder',
  });

/** Confirm a reviewed extraction: create the bill from the (possibly edited) fields. */
export async function approveReviewAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const me = await requireMember();
  const hh = getHousehold(me.householdId)!;
  const parsed = approveSchema.safeParse({
    documentId: str(fd, 'documentId'),
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
  });
  if (!parsed.success) return zodToState(parsed.error);
  const v = parsed.data;
  const te = await errorText();
  const doc = getDocument(hh.id, v.documentId);
  if (!doc || !getReviewItem(hh.id, doc.id, undefined, { viewer: me.id }))
    return { error: te('documentNotFound') };
  const chosenService = getService(hh.id, v.serviceId);
  if (!chosenService || !visibleTo(chosenService.ownerMemberId, me.id))
    return { error: te('serviceNotFound') };
  const amountMinor = parseMoneyToMinor(v.amount, hh.currency);
  if (amountMinor === null) return fieldErrors({ amount: 'validAmount' });
  let billId: string;
  try {
    billId = approveDocument(
      hh.id,
      doc.id,
      {
        serviceId: v.serviceId,
        amountMinor,
        currency: hh.currency,
        taxMinor: v.tax ? parseMoneyToMinor(v.tax, hh.currency) : null,
        taxLabel: v.taxLabel || null,
        periodStart: v.periodStart,
        periodEnd: v.periodEnd,
        issueDate: v.issueDate || null,
        dueDate: v.dueDate,
        usageQuantity: v.usageQuantity ? Number(v.usageQuantity) : null,
        usageUnit: v.usageUnit || null,
        externalRef: v.externalRef || null,
        notes: v.notes || null,
      },
      me,
      { trustSender: fd.get('trustSender') === 'on' },
    ).billId;
  } catch (e) {
    return { error: (e as Error).message };
  }
  revalidatePath('/review');
  revalidatePath('/bills');
  redirect(`/bills/${billId}`);
}

export async function ignoreDocumentAction(fd: FormData): Promise<void> {
  const me = await requireMember();
  if (getReviewItem(me.householdId, str(fd, 'documentId'), undefined, { viewer: me.id }))
    setDocumentStatus(me.householdId, str(fd, 'documentId'), 'ignored', undefined);
  revalidatePath('/review');
  redirect('/review');
}

/** "It's a bill": read a filed-away document again as a bill (a person vouches for it). */
export async function readAsBillAction(fd: FormData): Promise<void> {
  const me = await requireMember();
  const id = str(fd, 'documentId');
  if (!getReviewItem(me.householdId, id, undefined, { viewer: me.id })) redirect('/review');
  const outcome = await processDocument(me.householdId, id, undefined, {
    asBill: true,
    by: me.id,
  });
  revalidatePath('/review');
  revalidatePath('/bills');
  redirect(
    outcome.status === 'extracted' && outcome.billId ? `/bills/${outcome.billId}` : `/review/${id}`,
  );
}

export async function reprocessDocumentAction(fd: FormData): Promise<void> {
  const me = await requireMember();
  const id = str(fd, 'documentId');
  if (!getReviewItem(me.householdId, id, undefined, { viewer: me.id })) redirect('/review');
  const outcome = await processDocument(me.householdId, id);
  revalidatePath('/review');
  revalidatePath('/bills');
  redirect(
    outcome.status === 'extracted' && outcome.billId ? `/bills/${outcome.billId}` : `/review/${id}`,
  );
}

/** Re-run the pipeline over every document that isn't already a bill. */
export async function reprocessAllAction(): Promise<void> {
  const me = await requireMember();
  // Only what's waiting: re-reading a notice would re-flag a bill someone already sorted.
  for (const d of listDocuments(me.householdId, { viewer: me.id })) {
    if (d.status !== 'needs_review' && d.status !== 'unprocessed') continue;
    await processDocument(me.householdId, d.id);
  }
  revalidatePath('/review');
  revalidatePath('/bills');
  redirect('/review');
}

export async function pollNowAction(): Promise<void> {
  await requireOperator();
  await pollNow();
  revalidatePath('/status');
  revalidatePath('/review');
  redirect('/status');
}

export async function uploadBillAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const me = await requireMember();
  const file = fd.get('file');
  const te = await errorText();
  if (!(file instanceof File) || file.size === 0) return { error: te('uploadType') };
  if (file.size > 25 * 1024 * 1024) return { error: te('uploadSize') };
  if (!rateLimit(`upload:${me.householdId}`, UPLOADS_PER_HOUR, 3_600_000))
    return { error: te('uploadRate') };
  const buffer = Buffer.from(await file.arrayBuffer());
  const { doc, duplicate } = archiveDocument(me.householdId, {
    kind: 'upload',
    buffer,
    originalFilename: file.name,
    mimeType: file.type || null,
    memberId: me.id,
  });
  if (duplicate) {
    const existing = listDocuments(me.householdId, { viewer: me.id }).find((d) => d.id === doc.id);
    if (existing?.billId) redirect(`/bills/${existing.billId}`);
    redirect(`/review/${doc.id}`);
  }
  const outcome = await processDocument(me.householdId, doc.id);
  revalidatePath('/review');
  revalidatePath('/bills');
  redirect(
    outcome.status === 'extracted' && outcome.billId
      ? `/bills/${outcome.billId}`
      : `/review/${doc.id}`,
  );
}
