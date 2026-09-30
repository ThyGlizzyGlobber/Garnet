import { and, eq } from 'drizzle-orm';
import { getDb, type Db } from '@/db/client';
import { bill, service, sourceDocument, type SourceDocument } from '@/db/schema';
import { actingMember } from '@/lib/acting-member';
import { promoteServiceType, serviceForNewProvider, typeFits } from '@/lib/auto-service';
import { autoFileBill, refKeys } from '@/lib/assets';
import { createBill, getBill, type BillDetail } from '@/lib/bills';
import { getEnv, isLlmConfigured } from '@/lib/env';
import { refileDocuments } from '@/lib/filing';
import { getHousehold } from '@/lib/households';
import { saveBillMetrics } from '@/lib/metrics';
import { classifyNotice, classifySubject, looksLikeBill } from '@/lib/notices';
import { confirmOwnership } from '@/lib/ownership';
import { notifyBillCreated, notifyInBackground, notifyServiceCreated } from '@/lib/notifications';
import { sameProvider } from '@/lib/provider-match';
import type { Scope } from '@/lib/scope';
import { addressOf, isTrustedSender, trustTarget } from '@/lib/sender-auth';
import { getService, listServices, listServiceTypes, updateService } from '@/lib/services';
import { aiAllowance, AI_READ, recordUsage } from '@/lib/usage';
import { getDocument, readDocument, setDocumentStatus } from './archive';
import { fallbackExtractors, templateExtractors } from './extractors';
import { isTransientAiError } from './extractors/llm/anthropic';
import type { ExtractionInput, ExtractionResult, Extractor, ScanFile } from './extractors/types';
import { applyDocument, applyNotice, applyPaymentHints } from './payments';
import { rotateDocument } from './rotate';
import { hasNoText, scanFor } from './scan';
import { extractText } from './text';
import { documentScope, isProvidersDomain, mayActFor, standingOf } from './trust';

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
  /** What the pipeline decided (receipt, payment_failed, not-a-bill, …); drives the inbox filters. */
  code?: string;
  /** For notices: the bill it changed (marked paid or flagged). */
  billId?: string;
  /** Reads in a row that failed because the AI service was busy. */
  busyRetries?: number;
  /** The date printed on the document (for a forward, the original's), when the AI read one. */
  documentDate?: string;
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
    locale: hh?.locale ?? getEnv().DEFAULT_LOCALE,
    defaultCurrency: hh?.currency ?? getEnv().DEFAULT_CURRENCY,
    services: listServices(householdId, documentScope(householdId, doc, db), db).map((s) => ({
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
 * Documents being read right now. The worker and the pages are separate
 * bundles in one process, so this lives on globalThis: a second read of the
 * same file (inbound mail, "Re-read", a busy retry) never makes a second bill.
 */
const shared = globalThis as unknown as { __hudReading?: Set<string> };
const reading = (shared.__hudReading ??= new Set<string>());

/**
 * Full pipeline for an archived document: text → extractors → bill or review.
 * Low-confidence, unmatched-service, and duplicate results never become bills silently.
 */
export async function processDocument(
  householdId: string,
  documentId: string,
  db: Db = getDb(),
  opts: ReadOptions = {},
): Promise<PipelineOutcome> {
  const current = getDocument(householdId, documentId, db);
  if (!current) throw new Error('Document not found');
  // Already a bill: reading it again would only make it a duplicate of itself.
  if (current.status === 'extracted' || reading.has(documentId)) {
    const made = db
      .select({ id: bill.id })
      .from(bill)
      .where(and(eq(bill.householdId, householdId), eq(bill.sourceDocumentId, documentId)))
      .get();
    return {
      documentId,
      status: current.status === 'extracted' ? 'extracted' : 'needs_review',
      reason: current.status === 'extracted' ? 'already-read' : 'being-read',
      result: null,
      billId: made?.id,
    };
  }
  reading.add(documentId);
  try {
    return await readAndFile(householdId, documentId, current, db, opts);
  } finally {
    reading.delete(documentId);
  }
}

async function readAndFile(
  householdId: string,
  documentId: string,
  current: SourceDocument,
  db: Db,
  opts: ReadOptions,
): Promise<PipelineOutcome> {
  const before = storedExtraction(current);
  const outcome = await readAndRoute(householdId, documentId, db, opts);
  // A new bill (or a receipt for one): file it where it belongs straight away.
  if (outcome.billId) refileDocuments(householdId, db);
  // Remember what it turned out to be (and, for a notice, the bill it changed)
  // for the inbox filters and the review page.
  const doc = getDocument(householdId, documentId, db);
  const stored = storedExtraction(doc);
  if (doc && stored) {
    stored.code = outcome.reason ?? outcome.status;
    if (outcome.status === 'notice' && outcome.billId) stored.billId = outcome.billId;
    // The AI was busy: count it, so retryBusyReads() backs off and eventually stops.
    if (stored.attempts.some((a) => a.error && isTransientAiError(a.error)))
      stored.busyRetries = (before?.busyRetries ?? 0) + 1;
    setDocumentStatus(householdId, doc.id, doc.status, JSON.stringify(stored), db);
  }
  return outcome;
}

export interface ReadOptions {
  /**
   * A household member says this document is a bill ("It's a bill" in the
   * Inbox): the AI is told so, notice rules are skipped, and it's trusted like
   * an upload, since a person vouches for it.
   */
  asBill?: boolean;
  /** The member who said so: it's theirs when nobody else is known to have sent it. */
  by?: string | null;
}

async function readAndRoute(
  householdId: string,
  documentId: string,
  db: Db,
  opts: ReadOptions,
): Promise<PipelineOutcome> {
  const found = getDocument(householdId, documentId, db);
  if (!found) throw new Error('Document not found');
  // senderVerified null = brought in by the household (uploads); see mayActFor.
  const doc = opts.asBill
    ? {
        ...found,
        senderVerified: null,
        // Who it came from still decides which personal services it may reach.
        memberId: actingMember(householdId, found, db) ?? opts.by ?? null,
      }
    : found;
  const env = getEnv();
  // A damaged or unsupported file must still land in the review queue, never vanish.
  let text = '';
  let readError: string | null = null;
  try {
    text = await extractText(readDocument(doc), doc.mimeType, doc.originalFilename);
  } catch (e) {
    readError = (e as Error).message;
  }
  // The date printed on the document, once the AI has read it (see StoredExtraction).
  let documentDate: string | null = null;
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
      ...(documentDate ? { documentDate } : {}),
    };
    setDocumentStatus(householdId, doc.id, status, JSON.stringify(stored), db);
  };

  if (readError) {
    console.warn(`[ingest] could not read ${doc.id}: ${readError}`);
    store('needs_review', 'This file could not be read (damaged or unsupported)', null, []);
    return { documentId: doc.id, status: 'needs_review', reason: 'unreadable', result: null };
  }
  // No text layer: a scan or photo is read from the file itself by the AI reader.
  let scan: ScanFile | null = null;
  if (hasNoText(text)) {
    const found = await scanFor(doc);
    if (found && 'problem' in found) {
      store('needs_review', found.problem, null, []);
      return { documentId: doc.id, status: 'needs_review', reason: 'no-text', result: null };
    }
    if (!found) {
      store('needs_review', 'No readable text in this file', null, []);
      return { documentId: doc.id, status: 'needs_review', reason: 'no-text', result: null };
    }
    scan = found.file;
  }

  // Mail to a household bills address: provider notices (payment failed, overdue,
  // payment received) update the matching bill instead of being read as a bill.
  const fromBillsAddress = doc.senderVerified !== null;
  const emailBody = fromBillsAddress && doc.kind === 'email';
  const input = {
    ...buildInput(householdId, text, doc, db),
    file: scan,
    hint: opts.asBill ? ('bill' as const) : null,
  };
  // AI reads are capped per household per month (AI_MONTHLY_LIMIT).
  const aiLeft = aiAllowance(householdId, db).left > 0;
  const aiReads = aiLeft && fallbackExtractors.some((e) => e.canHandle(input));

  // The AI reader decides what every document is. Only when it can't run (no
  // key, or the month's limit is used up) do the keyword rules look at an
  // email's subject first, and at its body once no bill could be read.
  if (emailBody && !aiReads) {
    const kind = classifySubject(doc.emailSubject);
    if (kind) return applyNotice(householdId, doc, kind, text, store, db);
  }
  const notABill = (attempts: StoredExtraction['attempts']): PipelineOutcome | null => {
    if (!emailBody) return null;
    const kind = classifyNotice(doc.emailSubject, text);
    if (kind) return applyNotice(householdId, doc, kind, text, store, db);
    if (looksLikeBill(doc.emailSubject, text)) return null;
    // The AI failed (bad key, outage): nobody has really read it, so a person should.
    if (attempts.some((a) => a.error)) return null;
    store('notice', 'Not a bill (kept for reference)', null, attempts);
    return { documentId: doc.id, status: 'notice', reason: 'not-a-bill', result: null };
  };

  const { best, attempts } = await runExtractors(input, {
    extractors: aiLeft ? [...templateExtractors, ...fallbackExtractors] : templateExtractors,
  });
  documentDate = best?.document?.date ?? best?.bill.issueDate ?? null;
  // A sideways or upside-down scan: turn it the right way up, for good.
  if (scan && best?.rotation?.length) {
    try {
      if (await rotateDocument(householdId, doc.id, best.rotation, db))
        console.log(`[ingest] turned ${doc.id} the right way up`);
    } catch (e) {
      console.warn(`[ingest] couldn't turn ${doc.id}:`, (e as Error).message);
    }
  }
  // Failed calls (bad key, outage) aren't charged, so they don't count either.
  if (attempts.some((a) => a.extractor.startsWith('llm:') && !a.error))
    recordUsage(householdId, AI_READ, db);
  const aiError = attempts.find((a) => a.error)?.error;
  // Marked as a bill, but the reader still found no bill details: a person fills them in.
  // Stored reasons are shown to households, so they say what happened in plain words (rule 1).
  if (opts.asBill && best && !best.bill.periodStart) {
    store(
      'needs_review',
      'Marked as a bill, but the bill’s details couldn’t be made out. Fill them in below.',
      best,
      attempts,
    );
    return { documentId: doc.id, status: 'needs_review', reason: 'as-bill-unread', result: best };
  }
  // The AI reader says what a document is; anything but a bill never becomes one.
  if (!opts.asBill && best?.document && best.document.kind !== 'bill') {
    const routed = applyDocument(
      householdId,
      doc,
      best,
      text,
      store,
      db,
      env.EXTRACTOR_CONFIDENCE_THRESHOLD,
    );
    if (routed) return routed;
  }
  if (!best) {
    const notice = notABill(attempts);
    if (notice) return notice;
    store(
      'needs_review',
      aiError && isTransientAiError(aiError)
        ? `Analysing is busy right now, so the app will try again shortly (${aiProblem(aiError)})`
        : aiError
          ? `This couldn’t be analysed, so it needs checking by hand (${aiProblem(aiError)})`
          : attempts.length
            ? 'Nothing on this document could be made out'
            : aiLeft && isLlmConfigured(env)
              ? 'There is too little text in this document to analyse, so it needs entering by hand'
              : aiLeft
                ? 'Analysing documents is not set up on this server, so this needs entering by hand'
                : 'This month’s analysing limit is used up, so this needs entering by hand',
      null,
      attempts,
    );
    return { documentId: doc.id, status: 'needs_review', reason: 'no-result', result: null };
  }
  if (best.confidence < env.EXTRACTOR_CONFIDENCE_THRESHOLD) {
    const notice = notABill(attempts);
    if (notice) return notice;
    store('needs_review', 'Some details need checking', best, attempts);
    return { documentId: doc.id, status: 'needs_review', reason: 'low-confidence', result: best };
  }
  let serviceId =
    best.bill.serviceId && getService(householdId, best.bill.serviceId, db)
      ? best.bill.serviceId
      : matchService(householdId, best, db, documentScope(householdId, doc, db));
  let newService: string | null = null;
  if (!serviceId) {
    // No service for this provider yet: set one up from the bill, when the
    // document may (an upload, a member's forward, or the provider's own signed mail).
    const setup = autoServiceFor(householdId, doc, best.bill, db);
    if (setup) {
      serviceId = setup.service.id;
      if (setup.created) newService = setup.service.id;
    }
  }
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
  const standing = standingOf(householdId, doc, db);
  if (standing === 'unsigned' || standing === 'signed') {
    const svc = getService(householdId, serviceId, db)!;
    const domain = doc.senderDomain ?? 'an unknown sender';
    const address = addressOf(doc.emailFrom);
    if (standing === 'unsigned') {
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
    if (!isTrustedSender(doc.senderDomain, svc.trustedSenders, address)) {
      // A signed email from a domain that is plainly the provider's (agl.com.au for
      // AGL) is trusted on its first bill, with no one asked. Anything else waits.
      if (isProvidersDomain(doc, svc.provider)) {
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
  // A service still filed as "Other" takes the bill's type (e.g. Council rates).
  promoteServiceType(
    householdId,
    getService(householdId, serviceId, db)!,
    best.bill.serviceType,
    db,
  );
  let created: BillDetail;
  try {
    created = createBillFromExtraction(householdId, best, serviceId, doc.id, db);
  } catch (e) {
    // Never leave a document half-read: whatever stopped the bill, a person decides.
    store('needs_review', `This bill couldn't be saved (${(e as Error).message})`, best, attempts);
    return { documentId: doc.id, status: 'needs_review', reason: 'not-saved', result: best };
  }
  // A plate or policy number one of the vehicles or policies has: filed under
  // it, on its side (a household car's rego on the household's Registration).
  // A service set up for this bill and left empty by that goes again.
  if (autoFileBill(householdId, created.id, documentScope(householdId, doc, db), db)) {
    const filed = getBill(householdId, created.id, db)!;
    if (newService && filed.serviceId !== newService) {
      db.delete(service).where(eq(service.id, newService)).run();
      newService = null;
    } else if (newService) {
      // Whose it is follows the vehicle or policy: nobody needs asking.
      confirmOwnership(householdId, newService, db);
    }
    serviceId = filed.serviceId;
    created = filed;
  }
  store('extracted', `Created bill via ${best.extractor}`, best, attempts);
  applyPaymentHints(householdId, serviceId, best.bill, db);
  if (newService) notifyInBackground(notifyServiceCreated(householdId, newService, { db }));
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

/**
 * Match by provider name (case-insensitive, either containing the other) then
 * by service type when unique, among the services in scope (see documentScope).
 */
export function matchService(
  householdId: string,
  result: ExtractionResult,
  db: Db = getDb(),
  scope: Scope = { everyone: true },
): string | null {
  const services = listServices(householdId, scope, db);
  const p = result.bill.provider;
  // The same rule that decides whether a new provider needs a service of its own.
  const byProvider = services.filter((s) => sameProvider(s.provider, p));
  if (byProvider.length) {
    // One provider can supply several things (AGL power and gas): the service
    // must also be of the bill's type. A gas bill from the household's only AGL
    // service, which is electricity, is a new service, not that one.
    const typed = byProvider.filter((s) => typeFits(s.typeSlug, result.bill.serviceType));
    if (typed.length === 1) return typed[0]!.id;
    const exact = typed.filter((s) => s.typeSlug === result.bill.serviceType);
    return exact.length === 1 ? exact[0]!.id : null;
  }
  // A named provider with no service is a new provider (set up automatically),
  // not the household's other service of the same type: after switching
  // retailers, the new one's bills must not land on the old service.
  if (p.trim()) return null;
  const byType = services.filter((s) => s.typeSlug === result.bill.serviceType);
  return byType.length === 1 ? byType[0]!.id : null;
}

function createBillFromExtraction(
  householdId: string,
  result: ExtractionResult,
  serviceId: string,
  sourceDocumentId: string,
  db: Db = getDb(),
): BillDetail {
  const b = result.bill;
  const created = createBill(
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
      // The reader's own remarks stay in the document's record, not on the bill.
      notes: null,
      instalments: b.instalments ?? null,
      assetRefs: refKeys([...(b.assetRefs ?? []), b.accountRef]),
    },
    db,
  );
  saveBillMetrics(householdId, created.id, b.metrics, db);
  return created;
}

/**
 * Who may set up a new service from a bill, and with what: the household (an
 * upload; the payer defaults to the admin), a member's forward (they're the
 * payer), or signed mail from a domain that plainly is the provider's
 * (remembered as trusted). A stranger's mail never creates a service.
 */
function autoServiceFor(
  householdId: string,
  doc: SourceDocument,
  bill: ExtractionResult['bill'],
  db: Db,
) {
  const member = actingMember(householdId, doc, db);
  const scope = documentScope(householdId, doc, db);
  switch (standingOf(householdId, doc, db)) {
    case 'household':
      return serviceForNewProvider(householdId, bill, { member, scope }, db);
    case 'member':
      return serviceForNewProvider(householdId, bill, { payerMemberId: member, member, scope }, db);
    case 'signed':
      return isProvidersDomain(doc, bill.provider)
        ? serviceForNewProvider(householdId, bill, { trustedDomain: doc.senderDomain, scope }, db)
        : null;
    case 'unsigned':
      return null;
  }
}

/** A short, readable version of an Anthropic API error for the review queue. */
function aiProblem(error: string): string {
  const message = error.match(/"message":\s*"((?:[^"\\]|\\.)*)"/)?.[1] ?? error;
  return message.length > 200 ? `${message.slice(0, 197)}…` : message;
}

function storedExtraction(doc: SourceDocument | null): StoredExtraction | null {
  if (!doc?.extractionJson) return null;
  try {
    return JSON.parse(doc.extractionJson) as StoredExtraction;
  } catch {
    return null;
  }
}

/** Busy reads are retried after 15 min, 30 min, 1 h, 2 h, 4 h, 8 h; then a person looks. */
const MAX_BUSY_RETRIES = 6;

/**
 * Documents whose AI read failed only because the service was busy: read them
 * again once their backoff has passed. Runs from the worker's 15-minute tick.
 */
export async function retryBusyReads(now = new Date(), db: Db = getDb()): Promise<number> {
  const waiting = db
    .select()
    .from(sourceDocument)
    .where(eq(sourceDocument.status, 'needs_review'))
    .all();
  let retried = 0;
  for (const doc of waiting) {
    const s = storedExtraction(doc);
    const n = s?.busyRetries ?? 0;
    if (!s || n < 1 || n > MAX_BUSY_RETRIES) continue;
    const due = Date.parse(s.processedAt) + 15 * 60_000 * 2 ** (n - 1);
    if (now.getTime() < due) continue;
    try {
      await processDocument(doc.householdId, doc.id, db);
      retried++;
    } catch (e) {
      console.error(`[ingest] re-reading ${doc.id}:`, (e as Error).message);
    }
  }
  return retried;
}
