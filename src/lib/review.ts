import { and, desc, eq, isNotNull, sql } from 'drizzle-orm';
import { getDb, type Db } from '@/db/client';
import { bill, sourceDocument, type SourceDocument } from '@/db/schema';
import type { StoredExtraction } from '@/ingest/pipeline';

export type ReviewItem = SourceDocument & {
  extraction: StoredExtraction | null;
  billId: string | null;
  category: DocumentCategory;
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
    };
  } catch {
    return null;
  }
}

export function listDocuments(
  householdId: string,
  opts: { status?: SourceDocument['status'] } = {},
  db: Db = getDb(),
): ReviewItem[] {
  const rows = db
    .select({ doc: sourceDocument, billId: bill.id })
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
  return rows.map((r) => {
    const extraction = parse(r.doc.extractionJson);
    return {
      ...r.doc,
      extraction,
      billId: r.billId,
      category: documentCategory(r.doc.status, extraction),
    };
  });
}

export function getReviewItem(
  householdId: string,
  id: string,
  db: Db = getDb(),
): ReviewItem | null {
  return listDocuments(householdId, {}, db).find((d) => d.id === id) ?? null;
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
