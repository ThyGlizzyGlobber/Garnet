import { desc, eq, isNotNull, sql } from 'drizzle-orm';
import { getDb, type Db } from '@/db/client';
import { bill, sourceDocument, type SourceDocument } from '@/db/schema';
import type { StoredExtraction } from '@/ingest/pipeline';

export type ReviewItem = SourceDocument & {
  extraction: StoredExtraction | null;
  billId: string | null;
};

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
    };
  } catch {
    return null;
  }
}

export function listDocuments(db: Db = getDb(), status?: SourceDocument['status']): ReviewItem[] {
  const rows = db
    .select({ doc: sourceDocument, billId: bill.id })
    .from(sourceDocument)
    .leftJoin(bill, eq(bill.sourceDocumentId, sourceDocument.id))
    .where(status ? eq(sourceDocument.status, status) : undefined)
    .orderBy(desc(sourceDocument.receivedAt))
    .all();
  return rows.map((r) => ({ ...r.doc, extraction: parse(r.doc.extractionJson), billId: r.billId }));
}

export function getReviewItem(id: string, db: Db = getDb()): ReviewItem | null {
  return listDocuments(db).find((d) => d.id === id) ?? null;
}

export function documentCounts(db: Db = getDb()): Record<SourceDocument['status'], number> {
  const rows = db
    .select({ status: sourceDocument.status, n: sql<number>`count(*)` })
    .from(sourceDocument)
    .groupBy(sourceDocument.status)
    .all();
  const out: Record<SourceDocument['status'], number> = {
    unprocessed: 0,
    extracted: 0,
    needs_review: 0,
    ignored: 0,
  };
  for (const r of rows) out[r.status] = r.n;
  return out;
}

/** How bills that came from documents were created: automatically (template/llm) or via the review form. */
export function ingestionStats(db: Db = getDb()): { auto: number; reviewed: number } {
  const rows = db
    .select({ source: bill.source, n: sql<number>`count(*)` })
    .from(bill)
    .where(isNotNull(bill.sourceDocumentId))
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
