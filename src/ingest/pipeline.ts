import { and, eq } from 'drizzle-orm';
import { refileDocuments } from '@/lib/filing';
import type { Scope } from '@/lib/scope';
import { getDb, type Db } from '@/db/client';
import { account, bill, sourceDocument, type SourceDocument } from '@/db/schema';
import { createBill, type BillDetail } from '@/lib/bills';
import { getEnv, isLlmConfigured } from '@/lib/env';
import { getHousehold } from '@/lib/households';
import { listMembers } from '@/lib/members';
import { getService, listServices, listServiceTypes, updateService } from '@/lib/services';
import { getDocument, readDocument, setDocumentStatus } from './archive';
import { fallbackExtractors, templateExtractors } from './extractors';
import type { ScanFile } from './extractors/types';
import { scanFor } from './scan';
import { isTransientAiError } from './extractors/llm/anthropic';
import type {
  DocumentKind,
  ExtractionInput,
  ExtractionResult,
  Extractor,
} from './extractors/types';
import { extractText } from './text';
import { aiAllowance, AI_READ, recordUsage } from '@/lib/usage';
import { householdEmails } from '@/lib/accounts';
import { addressOf, isFreemail, isTrustedSender, trustTarget } from '@/lib/sender-auth';
import { classifyNotice, classifySubject, looksLikeBill, type NoticeKind } from '@/lib/notices';
import { senderMatchesProvider } from '@/lib/provider-match';
import { billForNotice, setBillAlert, clearBillAlert, setBillPaidToProvider } from '@/lib/bills';
import { todayIn } from '@/lib/dates';
import {
  notifyBillAlert,
  notifyBillCreated,
  notifyInBackground,
  notifyServiceCreated,
} from '@/lib/notifications';
import { promoteServiceType, serviceForNewProvider, typeFits } from '@/lib/auto-service';
import { saveBillMetrics } from '@/lib/metrics';

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

/**
 * The member a document came from: whoever uploaded it, or the member whose
 * address a signed forward came from. Null for mail straight from a provider.
 */
export function actingMember(
  householdId: string,
  doc: Partial<SourceDocument>,
  db: Db = getDb(),
): string | null {
  if (doc.memberId) return doc.memberId;
  if (!doc.senderVerified) return null;
  const address = addressOf(doc.emailFrom ?? null);
  if (!address) return null;
  return (
    listMembers(householdId, db).find(
      (m) => m.email?.toLowerCase() === address || memberAccountEmail(m.accountId, db) === address,
    )?.id ?? null
  );
}

/**
 * The services a document may land on: the household's, plus the personal
 * ones of the member it came from. Mail straight from a provider may reach any
 * member's personal service (the trust rules still decide whether it acts).
 */
export function documentScope(
  householdId: string,
  doc: Partial<SourceDocument>,
  db: Db = getDb(),
): Scope {
  const member = actingMember(householdId, doc, db);
  return member ? { viewer: member } : { everyone: true };
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
 * Full pipeline for an archived document: text → extractors → bill or review.
 * Low-confidence, unmatched-service, and duplicate results never become bills silently.
 */
export async function processDocument(
  householdId: string,
  documentId: string,
  db: Db = getDb(),
  opts: ReadOptions = {},
): Promise<PipelineOutcome> {
  const before = storedExtraction(getDocument(householdId, documentId, db));
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
  if (text.trim().length < 20) {
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
  // Failed calls (bad key, outage) aren't charged, so they don't count either.
  if (attempts.some((a) => a.extractor.startsWith('llm:') && !a.error))
    recordUsage(householdId, AI_READ, db);
  const aiError = attempts.find((a) => a.error)?.error;
  // Marked as a bill, but the AI still found no bill details: a person fills them in.
  if (opts.asBill && best && !best.bill.periodStart) {
    store(
      'needs_review',
      'Marked as a bill, but the AI couldn’t read the bill details. Fill them in below.',
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
        ? `The AI service was busy, so the app will try reading this again shortly (${aiProblem(aiError)})`
        : aiError
          ? `The AI reader failed, so this needs checking by hand (${aiProblem(aiError)})`
          : attempts.length
            ? 'The AI reader could not read this document'
            : aiLeft && isLlmConfigured(env)
              ? 'There is too little text in this document for the AI reader, so this needs entering by hand'
              : aiLeft
                ? 'AI reading is not set up (no API key), so this needs entering by hand'
                : 'This month’s AI reading limit is used up, so this needs entering by hand',
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
  // A service still filed as "Other" takes the bill's type (e.g. Council rates).
  promoteServiceType(
    householdId,
    getService(householdId, serviceId, db)!,
    best.bill.serviceType,
    db,
  );
  const created = createBillFromExtraction(householdId, best, serviceId, doc.id, db);
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
  const p = result.bill.provider.toLowerCase();
  const byProvider = services.filter(
    (s) =>
      s.provider.toLowerCase() === p ||
      p.includes(s.provider.toLowerCase()) ||
      s.provider.toLowerCase().includes(p),
  );
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

export function createBillFromExtraction(
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
      notes: result.warnings.length ? result.warnings.join('\n') : null,
      instalments: b.instalments ?? null,
    },
    db,
  );
  saveBillMetrics(householdId, created.id, b.metrics, db);
  return created;
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
  providerHint?: string | null,
): PipelineOutcome {
  const label = NOTICE_LABEL[kind];
  const address = addressOf(doc.emailFrom);
  const services = listServices(
    householdId,
    { includeInactive: true, ...documentScope(householdId, doc, db) },
    db,
  );
  // By name (the AI's provider, or the provider named in the text) only when the
  // household itself brought the document in: an upload, or a member's forward.
  // Otherwise the sender's own domain must belong to the provider.
  const byName = () =>
    (providerHint
      ? services.find((s) => providerNameMatches(s.provider, providerHint))
      : undefined) ??
    services.find((s) =>
      new RegExp(`\\b${s.provider.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(
        `${doc.emailSubject ?? ''}\n${text.slice(0, 4000)}`,
      ),
    );
  let svc: (typeof services)[number] | undefined;
  if (doc.senderVerified === null) svc = byName();
  else if (doc.senderVerified) {
    const fromMember = !!address && householdEmails(householdId, db).has(address);
    svc = fromMember
      ? byName()
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

/** "Aussie Broadband" vs "Aussie Broadband Limited": same provider. */
function providerNameMatches(service: string, named: string): boolean {
  const a = compactName(service);
  const b = compactName(named);
  if (!a || !b) return false;
  if (a === b) return true;
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  return (
    (short.length >= 4 && long.includes(short)) || (short.length >= 3 && long.startsWith(short))
  );
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
  store: (status: PipelineOutcome['status'], reason: string, result: null, attempts: []) => void,
  db: Db,
): PipelineOutcome {
  const services = listServices(
    householdId,
    { includeInactive: true, ...documentScope(householdId, doc, db) },
    db,
  ).filter((s) => providerNameMatches(s.provider, receipt.provider));
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
function applyDocument(
  householdId: string,
  doc: SourceDocument,
  best: ExtractionResult,
  text: string,
  store: (
    status: PipelineOutcome['status'],
    reason: string,
    result: ExtractionResult | null,
    attempts: StoredExtraction['attempts'],
  ) => void,
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
        paidDate: info.payment?.date ?? doc.receivedAt.slice(0, 10),
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

/**
 * Who may set up a new service from a bill, and with what: uploads (the payer
 * defaults to the admin), a member's forward (they're the payer), or signed
 * mail from a domain that plainly is the provider's (remembered as trusted).
 * A stranger's mail never creates a service.
 */
function autoServiceFor(
  householdId: string,
  doc: SourceDocument,
  bill: ExtractionResult['bill'],
  db: Db,
) {
  const member = actingMember(householdId, doc, db);
  const scope = documentScope(householdId, doc, db);
  // An upload: the admin pays unless it's usually personal (then it's the uploader's own).
  if (doc.senderVerified === null)
    return serviceForNewProvider(householdId, bill, { member, scope }, db);
  if (!doc.senderVerified) return null;
  const address = addressOf(doc.emailFrom);
  if (address && householdEmails(householdId, db).has(address))
    return serviceForNewProvider(householdId, bill, { payerMemberId: member, member, scope }, db);
  if (!isFreemail(doc.senderDomain) && senderMatchesProvider(doc.senderDomain, bill.provider))
    return serviceForNewProvider(householdId, bill, { trustedDomain: doc.senderDomain, scope }, db);
  return null;
}

function memberAccountEmail(accountId: string | null, db: Db): string | null {
  if (!accountId) return null;
  return (
    db.select({ email: account.email }).from(account).where(eq(account.id, accountId)).get()
      ?.email ?? null
  );
}

/** A short, readable version of an Anthropic API error for the review queue. */
export function aiProblem(error: string): string {
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
export const MAX_BUSY_RETRIES = 6;

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
    await processDocument(doc.householdId, doc.id, db);
    retried++;
  }
  return retried;
}
