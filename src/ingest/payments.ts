import { and, eq } from 'drizzle-orm';
import type { Db } from '@/db/client';
import { bill, type SourceDocument } from '@/db/schema';
import { billForNotice, clearBillAlert, setBillAlert, setBillPaidToProvider } from '@/lib/bills';
import { dayIn, todayIn } from '@/lib/dates';
import { getHousehold } from '@/lib/households';
import { daysUntil } from '@/lib/periods';
import { notifyBillAlert, notifyInBackground } from '@/lib/notifications';
import { looksLikeBill, type NoticeKind } from '@/lib/notices';
import { sameProvider } from '@/lib/provider-match';
import { getService, listServices, updateService } from '@/lib/services';
import type { DocumentKind, ExtractionResult } from './extractors/types';
import type { PipelineOutcome, StoredExtraction } from './pipeline';
import { documentScope, mayActFor, standingOf, trustsSender } from './trust';

/**
 * Payments: receipts (mark the invoices they name paid to the provider),
 * provider notices (payment failed, overdue, payment received: flag or settle
 * the bill), and the payment hints printed on an invoice (auto-pay, what was
 * received for last month). Each acts only for services the document may act
 * for (see ./trust).
 */

/** Records what the pipeline decided about a document (src/ingest/pipeline.ts). */
export type Store = (
  status: PipelineOutcome['status'],
  reason: string,
  result: ExtractionResult | null,
  attempts: StoredExtraction['attempts'],
) => void;

/** The day a document arrived, in the household's time zone. */
function arrivalDay(householdId: string, doc: SourceDocument, db: Db): string {
  return dayIn(doc.receivedAt, getHousehold(householdId, db)?.timezone ?? 'UTC');
}

const NOTICE_LABEL: Record<NoticeKind, string> = {
  payment_failed: 'Payment failed',
  overdue: 'Overdue reminder',
  payment_received: 'Payment received',
};

/**
 * A provider notice: find the service it's about (by a verified, trusted or
 * provider-looking sender; for bills a member forwarded, by the provider's name
 * in the text) and update that service's bill. Unverified notices change nothing.
 */
export function applyNotice(
  householdId: string,
  doc: SourceDocument,
  kind: NoticeKind,
  text: string,
  store: Store,
  db: Db,
  providerHint?: string | null,
): PipelineOutcome {
  const label = NOTICE_LABEL[kind];
  const services = listServices(
    householdId,
    { includeInactive: true, ...documentScope(householdId, doc, db) },
    db,
  );
  // By name (the AI's provider, or the provider named in the text) only when the
  // household itself brought the document in: an upload, or a member's forward.
  // Otherwise the sender's own domain must belong to the provider.
  const byName = () =>
    (providerHint ? services.find((s) => sameProvider(s.provider, providerHint)) : undefined) ??
    services.find((s) =>
      new RegExp(`\\b${s.provider.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(
        `${doc.emailSubject ?? ''}\n${text.slice(0, 4000)}`,
      ),
    );
  const standing = standingOf(householdId, doc, db);
  const svc =
    standing === 'household' || standing === 'member'
      ? byName()
      : standing === 'signed'
        ? services.find((s) => trustsSender(doc, s))
        : undefined;
  const hh = getHousehold(householdId, db)!;
  const target = svc ? billForNotice(householdId, svc.id, kind, todayIn(hh.timezone), db) : null;
  if (!svc || !target) {
    store(
      'notice',
      `${label} notice. ${doc.senderVerified ? "It couldn't be matched to one of your bills" : "Its sender couldn't be verified"}, so no bill was changed`,
      null,
      [],
    );
    return { documentId: doc.id, status: 'notice', reason: kind, result: null };
  }
  if (kind === 'payment_received') {
    setBillPaidToProvider(householdId, target.id, true, db);
    clearBillAlert(householdId, target.id, db);
  } else {
    setBillAlert(householdId, target.id, kind, doc.id, db);
    notifyInBackground(notifyBillAlert(householdId, target.id, { db }));
  }
  store(
    'notice',
    `${label} notice from ${svc.provider}: updated the bill due ${target.dueDate}`,
    null,
    [],
  );
  return { documentId: doc.id, status: 'notice', reason: kind, result: null, billId: target.id };
}

/** What a payment receipt says: which invoices were paid, and when. */
interface PaymentReceipt {
  provider: string;
  paidDate: string;
  totalMinor: number;
  method: string | null;
  invoices: { ref: string; amountMinor: number }[];
}

/** A receipt: mark each invoice it lists as paid to the provider on the receipt's date. */
function applyReceipt(
  householdId: string,
  doc: SourceDocument,
  receipt: PaymentReceipt,
  store: Store,
  db: Db,
): PipelineOutcome {
  const services = listServices(
    householdId,
    { includeInactive: true, ...documentScope(householdId, doc, db) },
    db,
  ).filter((s) => sameProvider(s.provider, receipt.provider));
  const allowed = services.filter((s) => mayActFor(householdId, doc, s, db));
  const refs = receipt.invoices.map((i) => `#${i.ref}`).join(', ');
  if (!allowed.length) {
    store(
      'notice',
      `Payment receipt from ${receipt.provider} (${refs}). ${services.length ? "Its sender couldn't be verified" : 'No matching service'}, so no bill was changed`,
      null,
      [],
    );
    return { documentId: doc.id, status: 'notice', reason: 'receipt', result: null };
  }
  const paid: string[] = [];
  let firstBill: string | undefined;
  for (const inv of receipt.invoices) {
    const b = db
      .select()
      .from(bill)
      .where(and(eq(bill.householdId, householdId), eq(bill.externalRef, inv.ref)))
      .all()
      .find((x) => allowed.some((s) => s.id === x.serviceId));
    if (!b) continue;
    setBillPaidToProvider(
      householdId,
      b.id,
      true,
      db,
      `${receipt.paidDate}T00:00:00Z`,
      inv.amountMinor || null,
    );
    clearBillAlert(householdId, b.id, db);
    paid.push(`#${inv.ref}`);
    firstBill ??= b.id;
  }
  store(
    'notice',
    paid.length
      ? `Payment receipt from ${receipt.provider}: ${paid.join(', ')} marked paid on ${receipt.paidDate}`
      : `Payment receipt from ${receipt.provider} for ${refs}, which isn't in the app yet`,
    null,
    [],
  );
  return {
    documentId: doc.id,
    status: 'notice',
    reason: 'receipt',
    result: null,
    billId: firstBill,
  };
}

/**
 * Hints on an invoice: the provider charges automatically (remember it on the
 * service), and what it says about last month's bill (paid → mark it paid;
 * nothing received → flag it overdue).
 */
export function applyPaymentHints(
  householdId: string,
  serviceId: string,
  extracted: ExtractionResult['bill'],
  db: Db,
): void {
  const svc = getService(householdId, serviceId, db);
  if (!svc) return;
  if (extracted.autoPay && !svc.autoPay) updateService(householdId, svc.id, { autoPay: true }, db);
  const prev = extracted.previousPayment;
  if (!prev) return;
  const candidates = db
    .select()
    .from(bill)
    .where(and(eq(bill.householdId, householdId), eq(bill.serviceId, serviceId)))
    .all()
    .filter(
      (b) =>
        b.amountMinor === prev.amountDueMinor && Math.abs(daysUntil(b.dueDate, prev.dueDate)) <= 3,
    )
    .sort(
      (a, b) =>
        Math.abs(daysUntil(a.dueDate, prev.dueDate)) - Math.abs(daysUntil(b.dueDate, prev.dueDate)),
    );
  const target = candidates[0];
  if (!target) return;
  if (prev.receivedMinor >= prev.amountDueMinor) {
    if (!target.paidToProviderAt)
      setBillPaidToProvider(householdId, target.id, true, db, `${prev.dueDate}T00:00:00Z`);
    if (target.alertKind) clearBillAlert(householdId, target.id, db);
  } else if (prev.receivedMinor === 0 && target.alertKind !== 'overdue') {
    setBillAlert(householdId, target.id, 'overdue', null, db);
    notifyInBackground(notifyBillAlert(householdId, target.id, { db }));
  }
}

const DOCUMENT_NOTICE: Partial<Record<DocumentKind, NoticeKind>> = {
  payment_failed: 'payment_failed',
  overdue_notice: 'overdue',
  payment_received: 'payment_received',
};

/**
 * A non-bill document as classified by the AI reader: receipts mark the named
 * invoices paid; payment notices flag or settle a bill; anything else is kept
 * as a notice. Unsure readings change nothing. Returns null to fall through
 * (an unsure "other" that still looks like a bill goes to review).
 */
export function applyDocument(
  householdId: string,
  doc: SourceDocument,
  best: ExtractionResult,
  text: string,
  store: Store,
  db: Db,
  threshold: number,
): PipelineOutcome | null {
  const info = best.document!;
  const provider = info.provider ?? best.bill.provider;
  const sure = best.confidence >= threshold;
  if (info.kind === 'other') {
    if (!sure && looksLikeBill(doc.emailSubject, text)) return null;
    store('notice', 'Not a bill (kept for reference)', null, []);
    return { documentId: doc.id, status: 'notice', reason: 'not-a-bill', result: null };
  }
  if (!sure) {
    store(
      'notice',
      `Looks like a ${info.kind.replace(/_/g, ' ')} from ${provider || 'a provider'}, but the reading wasn't certain enough to change any bill`,
      null,
      [],
    );
    return { documentId: doc.id, status: 'notice', reason: 'unsure', result: null };
  }
  const refs = info.payment?.invoiceRefs.filter(Boolean) ?? [];
  if (info.kind === 'payment_receipt' && refs.length && provider) {
    return applyReceipt(
      householdId,
      doc,
      {
        provider,
        paidDate: info.payment?.date ?? arrivalDay(householdId, doc, db),
        totalMinor: info.payment?.amountMinor ?? 0,
        method: null,
        invoices: refs.map((ref) => ({ ref, amountMinor: 0 })),
      },
      store,
      db,
    );
  }
  const kind = DOCUMENT_NOTICE[info.kind] ?? 'payment_received';
  return applyNotice(householdId, doc, kind, text, store, db, provider);
}
