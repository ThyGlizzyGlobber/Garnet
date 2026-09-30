import { getDb, type Db } from '@/db/client';
import type { Member } from '@/db/schema';
import { autoFileBill, refKeys } from '@/lib/assets';
import { promoteServiceType } from '@/lib/auto-service';
import { createBill, type BillInput } from '@/lib/bills';
import { refileDocuments } from '@/lib/filing';
import { saveBillMetrics } from '@/lib/metrics';
import { notifyBillCreated, notifyInBackground } from '@/lib/notifications';
import { getReviewItem } from '@/lib/review';
import { addressOf, isTrustedSender, trustTarget } from '@/lib/sender-auth';
import { getService, updateService } from '@/lib/services';
import { getDocument, setDocumentStatus } from './archive';

/**
 * A person approves a document waiting in the Inbox: the bill is made from the
 * fields they checked, while what the AI read (figures, instalments, the type)
 * stays with it. With `trustSender`, later bills from the same signed sender
 * are read without asking (a personal mailbox only ever as the exact address).
 * Throws when the bill can't be made; a document that already made a bill is
 * refused, so a double submit never makes two.
 */
export function approveDocument(
  householdId: string,
  documentId: string,
  fields: Omit<BillInput, 'sourceDocumentId' | 'source' | 'extractor' | 'instalments'>,
  by: Member,
  opts: { trustSender?: boolean } = {},
  db: Db = getDb(),
): { billId: string } {
  const doc = getDocument(householdId, documentId, db);
  if (!doc) throw new Error('Document not found');
  if (doc.status === 'extracted') throw new Error('This document has already made a bill');
  const read = getReviewItem(householdId, doc.id, db)?.extraction?.result;
  const billId = createBill(
    householdId,
    {
      ...fields,
      sourceDocumentId: doc.id,
      source: 'manual',
      extractor: 'review',
      createdByMemberId: by.id,
      instalments: read?.bill.instalments ?? null,
      assetRefs: refKeys([...(read?.bill.assetRefs ?? []), read?.bill.accountRef]),
    },
    db,
  ).id;
  if (read?.bill.metrics) saveBillMetrics(householdId, billId, read.bill.metrics, db);
  // A service still filed as "Other" takes the type the AI read (e.g. Council rates).
  const svc = getService(householdId, fields.serviceId, db);
  if (svc) promoteServiceType(householdId, svc, read?.bill.serviceType, db);
  // A plate or policy number one of the vehicles or policies has: filed under it.
  autoFileBill(householdId, billId, { viewer: by.id }, db);
  const address = addressOf(doc.emailFrom);
  const target = doc.senderVerified ? trustTarget(doc.senderDomain, address) : null;
  if (
    opts.trustSender &&
    target &&
    svc &&
    !isTrustedSender(doc.senderDomain, svc.trustedSenders, address)
  )
    updateService(householdId, svc.id, { trustedSenders: [...svc.trustedSenders, target] }, db);
  // Keep the extraction record, noting that a person confirmed it.
  let json: string | undefined;
  try {
    const prev = doc.extractionJson
      ? (JSON.parse(doc.extractionJson) as Record<string, unknown>)
      : {};
    json = JSON.stringify({ ...prev, reason: `Approved in review by ${by.name}` });
  } catch {
    json = undefined;
  }
  setDocumentStatus(householdId, doc.id, 'extracted', json, db);
  refileDocuments(householdId, db);
  notifyInBackground(notifyBillCreated(householdId, billId, { except: by.id, db }));
  return { billId };
}
