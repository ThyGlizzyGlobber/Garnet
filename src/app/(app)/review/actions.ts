'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import type { ActionState } from '@/components/ui/form';
import { archiveDocument, getDocument, setDocumentStatus } from '@/ingest/archive';
import { processDocument } from '@/ingest/pipeline';
import { getService, updateService } from '@/lib/services';
import { addressOf, isTrustedSender, trustTarget } from '@/lib/sender-auth';
import { str, zodToState } from '@/lib/actions';
import { requireMember, requireOperator } from '@/lib/auth/session';
import { createBill } from '@/lib/bills';
import { isIsoDate } from '@/lib/dates';
import { parseMoneyToMinor } from '@/lib/format';
import { getHousehold } from '@/lib/households';
import { notifyBillCreated, notifyInBackground } from '@/lib/notifications';
import { saveBillMetrics } from '@/lib/metrics';
import { getReviewItem, listDocuments } from '@/lib/review';
import { pollNow } from '@/worker';

const isoDate = z.string().refine(isIsoDate, 'Use a valid date');
const approveSchema = z
  .object({
    documentId: z.string().min(1),
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
  })
  .refine((v) => v.periodEnd >= v.periodStart, {
    path: ['periodEnd'],
    message: 'Period end is before its start',
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
  const doc = getDocument(hh.id, v.documentId);
  if (!doc) return { error: 'Document not found' };
  const amountMinor = parseMoneyToMinor(v.amount, hh.currency);
  if (amountMinor === null)
    return {
      error: 'Please fix the highlighted fields.',
      fieldErrors: { amount: 'Enter a valid amount' },
    };
  // What the AI read stays with the bill (figures, instalments), whatever the person corrected.
  const read = getReviewItem(hh.id, doc.id)?.extraction?.result;
  let billId: string;
  try {
    billId = createBill(hh.id, {
      serviceId: v.serviceId,
      sourceDocumentId: doc.id,
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
      source: 'manual',
      extractor: 'review',
      externalRef: v.externalRef || null,
      notes: v.notes || null,
      createdByMemberId: me.id,
      instalments: read?.bill.instalments ?? null,
    }).id;
  } catch (e) {
    return { error: (e as Error).message };
  }
  if (read?.bill.metrics) saveBillMetrics(hh.id, billId, read.bill.metrics);
  // "Trust future bills from this sender": only for signed mail from that domain.
  // Personal mailboxes (gmail.com, …) are only ever trusted as the exact address.
  const address = addressOf(doc.emailFrom);
  const target = doc.senderVerified ? trustTarget(doc.senderDomain, address) : null;
  if (fd.get('trustSender') === 'on' && target) {
    const svc = getService(hh.id, v.serviceId);
    if (svc && !isTrustedSender(doc.senderDomain, svc.trustedSenders, address))
      updateService(hh.id, svc.id, { trustedSenders: [...svc.trustedSenders, target] });
  }
  // Keep the extraction record but note that a person confirmed it.
  let json: string | undefined;
  try {
    const prev = doc.extractionJson
      ? (JSON.parse(doc.extractionJson) as Record<string, unknown>)
      : {};
    json = JSON.stringify({ ...prev, reason: `Approved in review by ${me.name}` });
  } catch {
    json = undefined;
  }
  setDocumentStatus(hh.id, doc.id, 'extracted', json);
  notifyInBackground(notifyBillCreated(hh.id, billId, { except: me.id }));
  revalidatePath('/review');
  revalidatePath('/bills');
  redirect(`/bills/${billId}`);
}

export async function ignoreDocumentAction(fd: FormData): Promise<void> {
  const me = await requireMember();
  setDocumentStatus(me.householdId, str(fd, 'documentId'), 'ignored', undefined);
  revalidatePath('/review');
  redirect('/review');
}

/** "It's a bill": read a filed-away document again as a bill (a person vouches for it). */
export async function readAsBillAction(fd: FormData): Promise<void> {
  const me = await requireMember();
  const id = str(fd, 'documentId');
  if (!getDocument(me.householdId, id)) redirect('/review');
  const outcome = await processDocument(me.householdId, id, undefined, { asBill: true });
  revalidatePath('/review');
  revalidatePath('/bills');
  redirect(
    outcome.status === 'extracted' && outcome.billId ? `/bills/${outcome.billId}` : `/review/${id}`,
  );
}

export async function reprocessDocumentAction(fd: FormData): Promise<void> {
  const me = await requireMember();
  const id = str(fd, 'documentId');
  if (!getDocument(me.householdId, id)) redirect('/review');
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
  for (const d of listDocuments(me.householdId)) {
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
  if (!(file instanceof File) || file.size === 0)
    return { error: 'Choose a PDF, a photo, or an HTML or text file.' };
  if (file.size > 25 * 1024 * 1024) return { error: 'File is larger than 25 MB.' };
  const buffer = Buffer.from(await file.arrayBuffer());
  const { doc, duplicate } = archiveDocument(me.householdId, {
    kind: 'upload',
    buffer,
    originalFilename: file.name,
    mimeType: file.type || null,
  });
  if (duplicate) {
    const existing = listDocuments(me.householdId).find((d) => d.id === doc.id);
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
