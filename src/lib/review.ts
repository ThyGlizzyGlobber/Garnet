import { and, desc, eq, isNotNull, sql } from 'drizzle-orm';
import { getDb, type Db } from '@/db/client';
import { bill, sourceDocument, type SourceDocument } from '@/db/schema';
import type { StoredExtraction } from '@/ingest/pipeline';
import { billDate } from '@/lib/bill-month';
import { dayIn } from '@/lib/dates';
import { getHousehold } from '@/lib/households';
import { minorUnitDigits } from '@/lib/format';
import { amountWords, matchesAll, monthWords, searchTokens } from '@/lib/search';
import { inScope, type Scope } from '@/lib/scope';

export type ReviewItem = SourceDocument & {
  extraction: StoredExtraction | null;
  billId: string | null;
  /**
   * The bill this document belongs with, when it still exists: the bill made
   * from it, or the bill a receipt or notice was about. Its page is the one
   * page for the bill and everything that came with it.
   */
  linkedBillId: string | null;
  category: DocumentCategory;
  /**
   * The date the document belongs to (YYYY-MM-DD): its bill's month date, the
   * date printed on it, or, only when neither is known, the day it arrived.
   */
  date: string;
  /** The day it arrived, in the household's time zone (YYYY-MM-DD). */
  arrived: string;
};

/** Inbox filters: what a document turned out to be. */
type DocumentCategory = 'bill' | 'receipt' | 'other';

function documentCategory(
  status: SourceDocument['status'],
  extraction: StoredExtraction | null,
): DocumentCategory {
  if (status === 'extracted') return 'bill';
  // Documents read before the code was stored are recognised by their reason.
  if (extraction?.code === 'receipt' || /^Payment receipt/.test(extraction?.reason ?? ''))
    return 'receipt';
  return 'other';
}

function parse(json: string | null): StoredExtraction | null {
  if (!json) return null;
  try {
    const v = JSON.parse(json) as Partial<StoredExtraction>;
    return {
      result: v.result ?? null,
      attempts: v.attempts ?? [],
      reason: v.reason ?? '',
      textPreview: v.textPreview ?? '',
      processedAt: v.processedAt ?? '',
      ...(v.code ? { code: v.code } : {}),
      ...(v.billId ? { billId: v.billId } : {}),
      ...(v.documentDate ? { documentDate: v.documentDate } : {}),
    };
  } catch {
    return null;
  }
}

/**
 * The household's documents, newest first. A document that became (or acted
 * on) a member's personal bill is only listed for that member (see Scope).
 */
export function listDocuments(
  householdId: string,
  opts: { status?: SourceDocument['status']; id?: string } & Scope = {},
  db: Db = getDb(),
): ReviewItem[] {
  const tz = getHousehold(householdId, db)?.timezone ?? 'UTC';
  const billOwners = new Map(
    db
      .select({ id: bill.id, owner: bill.ownerMemberId })
      .from(bill)
      .where(eq(bill.householdId, householdId))
      .all()
      .map((r) => [r.id, r.owner]),
  );
  const rows = db
    .select({
      doc: sourceDocument,
      billId: bill.id,
      issueDate: bill.issueDate,
      periodStart: bill.periodStart,
      periodEnd: bill.periodEnd,
      dueDate: bill.dueDate,
    })
    .from(sourceDocument)
    .leftJoin(bill, eq(bill.sourceDocumentId, sourceDocument.id))
    .where(
      and(
        eq(sourceDocument.householdId, householdId),
        opts.status ? eq(sourceDocument.status, opts.status) : undefined,
        opts.id ? eq(sourceDocument.id, opts.id) : undefined,
      ),
    )
    .orderBy(desc(sourceDocument.receivedAt))
    .all();
  return rows
    .map((r) => {
      const extraction = parse(r.doc.extractionJson);
      const read = extraction?.result?.bill;
      const arrived = dayIn(r.doc.receivedAt, tz);
      const date = r.billId
        ? billDate({
            issueDate: r.issueDate,
            periodStart: r.periodStart!,
            periodEnd: r.periodEnd!,
            dueDate: r.dueDate!,
          })
        : (extraction?.documentDate ??
          (read?.periodStart && read.periodEnd && read.dueDate
            ? billDate({ ...read, issueDate: read.issueDate ?? null })
            : arrived));
      return {
        ...r.doc,
        extraction,
        billId: r.billId,
        category: documentCategory(r.doc.status, extraction),
        date,
        arrived,
        linkedBillId:
          r.billId ??
          (extraction?.billId && billOwners.has(extraction.billId) ? extraction.billId : null),
      };
    })
    .filter((d) => inScope((d.linkedBillId && billOwners.get(d.linkedBillId)) || null, opts))
    .sort((a, b) => b.date.localeCompare(a.date) || b.receivedAt.localeCompare(a.receivedAt));
}

/**
 * What to tell a person about a document, without the reader's inner workings:
 * "check" when some details need a look, nothing for one that simply became a
 * bill, otherwise the plain sentence the pipeline stored.
 */
export function plainReason(
  extraction: Pick<StoredExtraction, 'code' | 'reason'> | null,
): { kind: 'check' } | { kind: 'none' } | { kind: 'text'; text: string } {
  const reason = extraction?.reason ?? '';
  if (extraction?.code === 'low-confidence' || /\bConfidence \d+%|threshold/i.test(reason))
    return { kind: 'check' };
  if (!reason || extraction?.code === 'created' || /^Created bill via /.test(reason))
    return { kind: 'none' };
  return { kind: 'text', text: reason };
}

export function getReviewItem(
  householdId: string,
  id: string,
  db: Db = getDb(),
  scope: Scope = { everyone: true },
): ReviewItem | null {
  return listDocuments(householdId, { ...scope, id }, db)[0] ?? null;
}

export function documentCounts(
  householdId: string,
  db: Db = getDb(),
): Record<SourceDocument['status'], number> {
  const rows = db
    .select({ status: sourceDocument.status, n: sql<number>`count(*)` })
    .from(sourceDocument)
    .where(eq(sourceDocument.householdId, householdId))
    .groupBy(sourceDocument.status)
    .all();
  const out: Record<SourceDocument['status'], number> = {
    unprocessed: 0,
    extracted: 0,
    needs_review: 0,
    ignored: 0,
    notice: 0,
  };
  for (const r of rows) out[r.status] = r.n;
  return out;
}

/** How bills that came from documents were created: automatically (template/llm) or via the review form. */
export function ingestionStats(
  householdId: string,
  db: Db = getDb(),
): { auto: number; reviewed: number } {
  const rows = db
    .select({ source: bill.source, n: sql<number>`count(*)` })
    .from(bill)
    .where(and(eq(bill.householdId, householdId), isNotNull(bill.sourceDocumentId)))
    .groupBy(bill.source)
    .all();
  let auto = 0;
  let reviewed = 0;
  for (const r of rows) {
    if (r.source === 'manual') reviewed += r.n;
    else auto += r.n;
  }
  return { auto, reviewed };
}

/** Inbox search: provider, subject, sender, file name, what happened, amount, month. */
export function searchDocuments(
  docs: ReviewItem[],
  query: string,
  locale: string,
): { docs: ReviewItem[]; tokens: string[] } {
  const tokens = searchTokens(query);
  if (!tokens.length) return { docs, tokens };
  return {
    docs: docs.filter((d) => {
      const read = d.extraction?.result?.bill;
      const hay = [
        read?.provider ?? '',
        read?.serviceType ?? '',
        read?.externalRef ?? '',
        ...(read && read.amountMinor
          ? amountWords(read.amountMinor, minorUnitDigits(read.currency))
          : []),
        d.originalFilename ?? '',
        d.emailSubject ?? '',
        d.emailFrom ?? '',
        d.extraction?.reason ?? '',
        d.category,
        ...monthWords(d.date.slice(0, 7), locale),
      ]
        .join(' ')
        .toLowerCase();
      return matchesAll(hay, tokens);
    }),
    tokens,
  };
}

/** The badge colour for a document's status, the same wherever it's shown. */
export const STATUS_TONE = {
  needs_review: 'warning',
  extracted: 'success',
  ignored: 'neutral',
  unprocessed: 'accent',
  notice: 'neutral',
} as const satisfies Record<SourceDocument['status'], string>;
