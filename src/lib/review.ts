import { and, desc, eq, isNotNull, sql } from 'drizzle-orm';
import { getDb, type Db } from '@/db/client';
import { bill, sourceDocument, type SourceDocument } from '@/db/schema';
import type { StoredExtraction } from '@/ingest/pipeline';
import { billDate } from '@/lib/bill-month';
import { minorUnitDigits } from '@/lib/format';
import { amountWords, matchesAll, monthWords, searchTokens } from '@/lib/search';
import { inScope, type Scope } from '@/lib/scope';

export type ReviewItem = SourceDocument & {
  extraction: StoredExtraction | null;
  billId: string | null;
  category: DocumentCategory;
  /**
   * The date the document belongs to (YYYY-MM-DD): its bill's month date, the
   * date printed on it, or, only when neither is known, the day it arrived.
   */
  date: string;
};

/** Inbox filters: what a document turned out to be. */
export type DocumentCategory = 'bill' | 'receipt' | 'other';

export function documentCategory(
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
  opts: { status?: SourceDocument['status'] } & Scope = {},
  db: Db = getDb(),
): ReviewItem[] {
  const owners = new Map(
    db
      .select({ id: bill.id, owner: bill.ownerMemberId })
      .from(bill)
      .where(and(eq(bill.householdId, householdId), isNotNull(bill.ownerMemberId)))
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
      ),
    )
    .orderBy(desc(sourceDocument.receivedAt))
    .all();
  return rows
    .map((r) => {
      const extraction = parse(r.doc.extractionJson);
      const read = extraction?.result?.bill;
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
            : r.doc.receivedAt.slice(0, 10)));
      return {
        ...r.doc,
        extraction,
        billId: r.billId,
        category: documentCategory(r.doc.status, extraction),
        date,
      };
    })
    .filter((d) => {
      const billId = d.billId ?? d.extraction?.billId;
      return inScope((billId && owners.get(billId)) || null, opts);
    })
    .sort((a, b) => b.date.localeCompare(a.date) || b.receivedAt.localeCompare(a.receivedAt));
}

export function getReviewItem(
  householdId: string,
  id: string,
  db: Db = getDb(),
  scope: Scope = { everyone: true },
): ReviewItem | null {
  return listDocuments(householdId, scope, db).find((d) => d.id === id) ?? null;
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
