'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import type { ActionState } from '@/components/ui/form';
import { archiveDocument, getDocument, setDocumentStatus } from '@/ingest/archive';
import { processDocument } from '@/ingest/pipeline';
import { str, zodToState } from '@/lib/actions';
import { requireMember } from '@/lib/auth/session';
import { createBill } from '@/lib/bills';
import { isIsoDate } from '@/lib/dates';
import { parseMoneyToMinor } from '@/lib/format';
import { getHousehold } from '@/lib/households';
import { listDocuments } from '@/lib/review';
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
  const hh = getHousehold()!;
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
  const doc = getDocument(v.documentId);
  if (!doc) return { error: 'Document not found' };
  const amountMinor = parseMoneyToMinor(v.amount, hh.currency);
  if (amountMinor === null)
    return {
      error: 'Please fix the highlighted fields.',
      fieldErrors: { amount: 'Enter a valid amount' },
    };
  let billId: string;
  try {
    billId = createBill({
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
    }).id;
  } catch (e) {
    return { error: (e as Error).message };
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
  setDocumentStatus(doc.id, 'extracted', json);
  revalidatePath('/review');
  revalidatePath('/bills');
  redirect(`/bills/${billId}`);
}

export async function ignoreDocumentAction(fd: FormData): Promise<void> {
  await requireMember();
  setDocumentStatus(str(fd, 'documentId'), 'ignored', undefined);
  revalidatePath('/review');
  redirect('/review');
}

export async function reprocessDocumentAction(fd: FormData): Promise<void> {
  await requireMember();
  const id = str(fd, 'documentId');
  const outcome = await processDocument(id);
  revalidatePath('/review');
  revalidatePath('/bills');
  redirect(
    outcome.status === 'extracted' && outcome.billId ? `/bills/${outcome.billId}` : `/review/${id}`,
  );
}

/** Re-run the pipeline over every document that isn't already a bill. */
export async function reprocessAllAction(): Promise<void> {
  await requireMember();
  for (const d of listDocuments()) {
    if (d.billId || d.status === 'extracted' || d.kind === 'email') continue;
    await processDocument(d.id);
  }
  revalidatePath('/review');
  revalidatePath('/bills');
  redirect('/review');
}

export async function pollNowAction(): Promise<void> {
  await requireMember();
  await pollNow();
  revalidatePath('/status');
  revalidatePath('/review');
  redirect('/status');
}

export async function uploadBillAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  await requireMember();
  const file = fd.get('file');
  if (!(file instanceof File) || file.size === 0)
    return { error: 'Choose a PDF, HTML or text file.' };
  if (file.size > 25 * 1024 * 1024) return { error: 'File is larger than 25 MB.' };
  const buffer = Buffer.from(await file.arrayBuffer());
  const { doc, duplicate } = archiveDocument({
    kind: 'upload',
    buffer,
    originalFilename: file.name,
    mimeType: file.type || null,
  });
  if (duplicate) {
    const existing = listDocuments().find((d) => d.id === doc.id);
    if (existing?.billId) redirect(`/bills/${existing.billId}`);
    redirect(`/review/${doc.id}`);
  }
  const outcome = await processDocument(doc.id);
  revalidatePath('/review');
  revalidatePath('/bills');
  redirect(
    outcome.status === 'extracted' && outcome.billId
      ? `/bills/${outcome.billId}`
      : `/review/${doc.id}`,
  );
}
