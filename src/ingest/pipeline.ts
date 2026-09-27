import { and, eq } from 'drizzle-orm';
import { getDb, type Db } from '@/db/client';
import { bill, type SourceDocument } from '@/db/schema';
import { createBill, type BillDetail } from '@/lib/bills';
import { getEnv } from '@/lib/env';
import { getHousehold } from '@/lib/households';
import { getService, listServices, listServiceTypes, updateService } from '@/lib/services';
import { getDocument, readDocument, setDocumentStatus } from './archive';
import { fallbackExtractors, templateExtractors } from './extractors';
import type { ExtractionInput, ExtractionResult, Extractor } from './extractors/types';
import { extractText } from './text';
import { parseReceipt, type PaymentReceipt } from './receipts';
import { aiAllowance, AI_READ, recordUsage } from '@/lib/usage';
import { householdEmails } from '@/lib/accounts';
import { addressOf, isFreemail, isTrustedSender, trustTarget } from '@/lib/sender-auth';
import { classifyNotice, classifySubject, looksLikeBill, type NoticeKind } from '@/lib/notices';
import { senderMatchesProvider } from '@/lib/provider-match';
import { billForNotice, setBillAlert, clearBillAlert, setBillPaidToProvider } from '@/lib/bills';
import { todayIn } from '@/lib/dates';
import { notifyBillAlert, notifyBillCreated, notifyInBackground } from '@/lib/notifications';

export interface PipelineOutcome {
  documentId: string;
  status: 'extracted' | 'needs_review' | 'ignored' | 'notice';
  reason: string;
  result: ExtractionResult | null;
  billId?: string;
}

/** What gets stored in source_document.extraction_json for the review UI. */
export interface StoredExtraction {
  result: ExtractionResult | null;
  attempts: { extractor: string; confidence: number | null; error?: string }[];
  reason: string;
  textPreview: string;
  processedAt: string;
}

export function buildInput(
  householdId: string,
  text: string,
  doc: Partial<SourceDocument>,
  db: Db = getDb(),
): ExtractionInput {
  const hh = getHousehold(householdId, db);
  return {
    text,
    filename: doc.originalFilename ?? null,
    email:
      doc.emailFrom || doc.emailSubject
        ? { from: doc.emailFrom ?? null, subject: doc.emailSubject ?? null }
        : null,
    locale: hh?.locale ?? 'en-AU',
    defaultCurrency: hh?.currency ?? 'AUD',
    services: listServices(householdId, {}, db).map((s) => ({
      id: s.id,
      name: s.name,
      provider: s.provider,
      typeSlug: s.typeSlug,
    })),
    serviceTypes: listServiceTypes(db).map((t) => t.slug),
  };
}

/**
 * Try extractors in order and return the first result at or above the threshold,
 * otherwise the best attempt. Never throws for an extractor failure.
 */
export async function runExtractors(
  input: ExtractionInput,
  opts: { extractors?: Extractor[]; threshold?: number } = {},
): Promise<{ best: ExtractionResult | null; attempts: StoredExtraction['attempts'] }> {
  const extractors = opts.extractors ?? [...templateExtractors, ...fallbackExtractors];
  const threshold = opts.threshold ?? getEnv().EXTRACTOR_CONFIDENCE_THRESHOLD;
  const attempts: StoredExtraction['attempts'] = [];
  let best: ExtractionResult | null = null;
  for (const ex of extractors) {
    if (!ex.canHandle(input)) continue;
    try {
      const r = await ex.extract(input);
      attempts.push({ extractor: ex.name, confidence: r?.confidence ?? null });
      if (r && (!best || r.confidence > best.confidence)) best = r;
      if (r && r.confidence >= threshold) break;
    } catch (e) {
      attempts.push({ extractor: ex.name, confidence: null, error: (e as Error).message });
    }
  }
  return { best, attempts };
}

/**
 * Full pipeline for an archived document: text → extractors → bill or review.
 * Low-confidence, unmatched-service, and duplicate results never become bills silently.
 */
export async function processDocument(
  householdId: string,
  documentId: string,
  db: Db = getDb(),
): Promise<PipelineOutcome> {
  const doc = getDocument(householdId, documentId, db);
  if (!doc) throw new Error('Document not found');
  const env = getEnv();
  // A damaged or unsupported file must still land in the review queue, never vanish.
  let text = '';
  let readError: string | null = null;
  try {
    text = await extractText(readDocument(doc), doc.mimeType, doc.originalFilename);
  } catch (e) {
    readError = (e as Error).message;
  }
  const store = (
    status: PipelineOutcome['status'],
    reason: string,
    result: ExtractionResult | null,
    attempts: StoredExtraction['attempts'],
  ) => {
    const stored: StoredExtraction = {
      result,
      attempts,
      reason,
      textPreview: text.slice(0, 4000),
      processedAt: new Date().toISOString(),
    };
    setDocumentStatus(householdId, doc.id, status, JSON.stringify(stored), db);
  };

  if (readError) {
    console.warn(`[ingest] could not read ${doc.id}: ${readError}`);
    store('needs_review', 'This file could not be read (damaged or unsupported)', null, []);
    return { documentId: doc.id, status: 'needs_review', reason: 'unreadable', result: null };
  }
  if (text.trim().length < 20) {
    store('needs_review', 'No readable text (scanned image or unsupported file)', null, []);
    return { documentId: doc.id, status: 'needs_review', reason: 'no-text', result: null };
  }

  // Mail to a household bills address: provider notices (payment failed, overdue,
  // payment received) update the matching bill instead of being read as a bill.
  const fromBillsAddress = doc.senderVerified !== null;
  const emailBody = fromBillsAddress && doc.kind === 'email';
  // A payment receipt names the invoices it paid: mark those bills paid.
  const hhForLocale = getHousehold(householdId, db);
  const receipt = parseReceipt(text, hhForLocale?.locale ?? 'en-AU');
  if (receipt) return applyReceipt(householdId, doc, receipt, store, db);

  // The subject decides first; the body only once no bill could be read.
  if (emailBody) {
    const kind = classifySubject(doc.emailSubject);
    if (kind) return applyNotice(householdId, doc, kind, text, store, db);
  }
  const notABill = (attempts: StoredExtraction['attempts']): PipelineOutcome | null => {
    if (!emailBody) return null;
    const kind = classifyNotice(doc.emailSubject, text);
    if (kind) return applyNotice(householdId, doc, kind, text, store, db);
    if (looksLikeBill(doc.emailSubject, text)) return null;
    store(
      'notice',
      'Not a bill (kept, and forwarded to anyone who asked for copies)',
      null,
      attempts,
    );
    return { documentId: doc.id, status: 'notice', reason: 'not-a-bill', result: null };
  };

  const input = buildInput(householdId, text, doc, db);
  // AI reads are capped per household per month (AI_MONTHLY_LIMIT); templates never are.
  const aiLeft = aiAllowance(householdId, db).left > 0;
  const { best, attempts } = await runExtractors(input, {
    extractors: aiLeft ? [...templateExtractors, ...fallbackExtractors] : templateExtractors,
  });
  if (attempts.some((a) => a.extractor.startsWith('llm:'))) recordUsage(householdId, AI_READ, db);
  if (!best) {
    const notice = notABill(attempts);
    if (notice) return notice;
    store(
      'needs_review',
      attempts.length
        ? 'No extractor could read this bill'
        : aiLeft
          ? 'No extractor applies and AI extraction is not configured'
          : 'No template applies and this month’s AI reading limit is used up',
      null,
      attempts,
    );
    return { documentId: doc.id, status: 'needs_review', reason: 'no-result', result: null };
  }
  if (best.confidence < env.EXTRACTOR_CONFIDENCE_THRESHOLD) {
    const notice = notABill(attempts);
    if (notice) return notice;
    store(
      'needs_review',
      `Confidence ${Math.round(best.confidence * 100)}% is below the ${Math.round(env.EXTRACTOR_CONFIDENCE_THRESHOLD * 100)}% threshold`,
      best,
      attempts,
    );
    return { documentId: doc.id, status: 'needs_review', reason: 'low-confidence', result: best };
  }
  const serviceId =
    best.bill.serviceId && getService(householdId, best.bill.serviceId, db)
      ? best.bill.serviceId
      : matchService(householdId, best, db);
  if (!serviceId) {
    store('needs_review', `No service matches provider "${best.bill.provider}"`, best, attempts);
    return { documentId: doc.id, status: 'needs_review', reason: 'no-service', result: best };
  }
  if (best.bill.externalRef) {
    const dup = db
      .select({ id: bill.id })
      .from(bill)
      .where(
        and(
          eq(bill.householdId, householdId),
          eq(bill.serviceId, serviceId),
          eq(bill.externalRef, best.bill.externalRef),
        ),
      )
      .get();
    if (dup) {
      if (mayActFor(householdId, doc, getService(householdId, serviceId, db)!, db))
        applyPaymentHints(householdId, serviceId, best.bill, db);
      store('ignored', `Duplicate of an existing bill (${best.bill.externalRef})`, best, attempts);
      return {
        documentId: doc.id,
        status: 'ignored',
        reason: 'duplicate',
        result: best,
        billId: dup.id,
      };
    }
  }
  // Mail to a household bills address can come from anyone who learns it. Only a
  // signed message from a sender trusted for this service becomes a bill by
  // itself; everything else waits for one click in the review queue.
  if (doc.senderVerified !== null) {
    const svc = getService(householdId, serviceId, db)!;
    const domain = doc.senderDomain ?? 'an unknown sender';
    const address = addressOf(doc.emailFrom);
    if (!doc.senderVerified) {
      store(
        'needs_review',
        `This email isn't signed by ${domain}, so it can't be proven to come from ${svc.provider}. If it's genuine, add it`,
        best,
        attempts,
      );
      return {
        documentId: doc.id,
        status: 'needs_review',
        reason: 'unverified-sender',
        result: best,
      };
    }
    // A member forwarding a bill from their own inbox is the household acting.
    const fromMember = !!address && householdEmails(householdId, db).has(address);
    if (!fromMember && !isTrustedSender(doc.senderDomain, svc.trustedSenders, address)) {
      // A signed email from a domain that is plainly the provider's (agl.com.au for
      // AGL) is trusted on its first bill, with no one asked. Anything else waits.
      if (!isFreemail(doc.senderDomain) && senderMatchesProvider(doc.senderDomain, svc.provider)) {
        updateService(
          householdId,
          svc.id,
          { trustedSenders: [...svc.trustedSenders, doc.senderDomain!] },
          db,
        );
      } else {
        const who = trustTarget(doc.senderDomain, address) ?? domain;
        store(
          'needs_review',
          `This bill came from ${who}, which doesn't look like ${svc.provider}. If it's genuine, add it and tick "Trust future bills"`,
          best,
          attempts,
        );
        return {
          documentId: doc.id,
          status: 'needs_review',
          reason: 'untrusted-sender',
          result: best,
        };
      }
    }
  }
  const created = createBillFromExtraction(householdId, best, serviceId, doc.id, db);
  store('extracted', `Created bill via ${best.extractor}`, best, attempts);
  applyPaymentHints(householdId, serviceId, best.bill, db);
  try {
    await notifyBillCreated(householdId, created.id, { db });
  } catch (e) {
    console.error('[notify] new bill:', (e as Error).message);
  }
  return {
    documentId: doc.id,
    status: 'extracted',
    reason: 'created',
    result: best,
    billId: created.id,
  };
}

/** Match by provider name (case-insensitive, either containing the other) then by service type when unique. */
export function matchService(
  householdId: string,
  result: ExtractionResult,
  db: Db = getDb(),
): string | null {
  const services = listServices(householdId, {}, db);
  const p = result.bill.provider.toLowerCase();
  const byProvider = services.filter(
    (s) =>
      s.provider.toLowerCase() === p ||
      p.includes(s.provider.toLowerCase()) ||
      s.provider.toLowerCase().includes(p),
  );
  if (byProvider.length === 1) return byProvider[0]!.id;
  const byType = services.filter((s) => s.typeSlug === result.bill.serviceType);
  return byType.length === 1 ? byType[0]!.id : null;
}

export function createBillFromExtraction(
  householdId: string,
  result: ExtractionResult,
  serviceId: string,
  sourceDocumentId: string,
  db: Db = getDb(),
): BillDetail {
  const b = result.bill;
  return createBill(
    householdId,
    {
      serviceId,
      sourceDocumentId,
      amountMinor: b.amountMinor,
      currency: b.currency,
      taxMinor: b.taxMinor ?? null,
      taxLabel: b.taxLabel ?? null,
      periodStart: b.periodStart,
      periodEnd: b.periodEnd,
      issueDate: b.issueDate ?? null,
      dueDate: b.dueDate,
      usageQuantity: b.usageQuantity ?? null,
      usageUnit: b.usageUnit ?? null,
      source: result.extractor.startsWith('template') ? 'template' : 'llm',
      extractor: result.extractor,
      confidence: result.confidence,
      externalRef: b.externalRef ?? null,
      notes: result.warnings.length ? result.warnings.join('\n') : null,
    },
    db,
  );
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
function applyNotice(
  householdId: string,
  doc: SourceDocument,
  kind: NoticeKind,
  text: string,
  store: (status: PipelineOutcome['status'], reason: string, result: null, attempts: []) => void,
  db: Db,
): PipelineOutcome {
  const label = NOTICE_LABEL[kind];
  const address = addressOf(doc.emailFrom);
  const services = listServices(householdId, { includeInactive: true }, db);
  let svc: (typeof services)[number] | undefined;
  if (doc.senderVerified) {
    const fromMember = !!address && householdEmails(householdId, db).has(address);
    svc = fromMember
      ? services.find((s) =>
          new RegExp(`\\b${s.provider.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(
            `${doc.emailSubject ?? ''}\n${text.slice(0, 4000)}`,
          ),
        )
      : services.find(
          (s) =>
            isTrustedSender(doc.senderDomain, s.trustedSenders, address) ||
            (!isFreemail(doc.senderDomain) && senderMatchesProvider(doc.senderDomain, s.provider)),
        );
  }
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

/**
 * May this document change the household's bills for a service? Uploads (by a
 * member) and the operator's own mailbox: yes. Mail to a bills address: only
 * when signed, and from a member, a trusted sender, or the provider's own domain.
 */
function mayActFor(
  householdId: string,
  doc: SourceDocument,
  svc: { provider: string; trustedSenders: string[] },
  db: Db,
): boolean {
  if (doc.senderVerified === null) return true;
  if (!doc.senderVerified) return false;
  const address = addressOf(doc.emailFrom);
  if (address && householdEmails(householdId, db).has(address)) return true;
  return (
    isTrustedSender(doc.senderDomain, svc.trustedSenders, address) ||
    (!isFreemail(doc.senderDomain) && senderMatchesProvider(doc.senderDomain, svc.provider))
  );
}

const compactName = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

/** A receipt: mark each invoice it lists as paid to the provider on the receipt's date. */
function applyReceipt(
  householdId: string,
  doc: SourceDocument,
  receipt: PaymentReceipt,
  store: (status: PipelineOutcome['status'], reason: string, result: null, attempts: []) => void,
  db: Db,
): PipelineOutcome {
  const services = listServices(householdId, { includeInactive: true }, db).filter(
    (s) => compactName(s.provider) === compactName(receipt.provider),
  );
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
    setBillPaidToProvider(householdId, b.id, true, db, `${receipt.paidDate}T00:00:00Z`);
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
function applyPaymentHints(
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
        b.amountMinor === prev.amountDueMinor &&
        Math.abs(Date.parse(b.dueDate) - Date.parse(prev.dueDate)) <= 3 * 86_400_000,
    )
    .sort(
      (a, b) =>
        Math.abs(Date.parse(a.dueDate) - Date.parse(prev.dueDate)) -
        Math.abs(Date.parse(b.dueDate) - Date.parse(prev.dueDate)),
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
