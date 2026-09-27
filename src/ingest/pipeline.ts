import { and, eq } from 'drizzle-orm';
import { getDb, type Db } from '@/db/client';
import { bill, type SourceDocument } from '@/db/schema';
import { createBill, type BillDetail } from '@/lib/bills';
import { getEnv } from '@/lib/env';
import { getHousehold } from '@/lib/households';
import { getService, listServices, listServiceTypes } from '@/lib/services';
import { getDocument, readDocument, setDocumentStatus } from './archive';
import { fallbackExtractors, templateExtractors } from './extractors';
import type { ExtractionInput, ExtractionResult, Extractor } from './extractors/types';
import { extractText } from './text';
import { aiAllowance, AI_READ, recordUsage } from '@/lib/usage';
import { householdEmails } from '@/lib/accounts';
import { addressOf, isTrustedSender, trustTarget } from '@/lib/sender-auth';

export interface PipelineOutcome {
  documentId: string;
  status: 'extracted' | 'needs_review' | 'ignored';
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

  const input = buildInput(householdId, text, doc, db);
  // AI reads are capped per household per month (AI_MONTHLY_LIMIT); templates never are.
  const aiLeft = aiAllowance(householdId, db).left > 0;
  const { best, attempts } = await runExtractors(input, {
    extractors: aiLeft ? [...templateExtractors, ...fallbackExtractors] : templateExtractors,
  });
  if (attempts.some((a) => a.extractor.startsWith('llm:'))) recordUsage(householdId, AI_READ, db);
  if (!best) {
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
        `Not added automatically: the email from ${domain} isn't signed in a way that proves it came from there`,
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
      const who = trustTarget(doc.senderDomain, address) ?? domain;
      store(
        'needs_review',
        `First bill from ${who} for ${svc.name}: check it once and trust the sender to read future bills automatically`,
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
  const created = createBillFromExtraction(householdId, best, serviceId, doc.id, db);
  store('extracted', `Created bill via ${best.extractor}`, best, attempts);
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
