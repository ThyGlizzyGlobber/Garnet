import { getDb, type Db } from '@/db/client';
import type { SourceDocument } from '@/db/schema';
import { billsMissingMetrics, saveBillMetrics } from '@/lib/metrics';
import { listDocuments } from '@/lib/review';
import { AI_READ, aiAllowance, recordUsage } from '@/lib/usage';
import { getDocument, readDocument, setDocumentStatus } from './archive';
import { fallbackExtractors } from './extractors';
import type { ExtractionResult } from './extractors/types';
import { buildInput, runExtractors } from './pipeline';
import { scanFor } from './scan';
import { extractText } from './text';

/**
 * Catch-up for documents read before the app kept every figure and the date
 * printed on each document. Each document is one AI read against the month's
 * limit; stops when that runs out. Only the new details change: never a bill's
 * amount or dates, never what a notice did.
 */

const running = new Set<string>();

export function isReadingMetrics(householdId: string): boolean {
  return running.has(householdId);
}

/** Receipts and notices that don't have their printed date yet (they sit under their arrival month). */
export function documentsMissingDates(householdId: string, db: Db = getDb()): SourceDocument[] {
  return listDocuments(householdId, { status: 'notice', everyone: true }, db).filter(
    (d) => d.extraction && !d.extraction.documentDate && !d.billId,
  );
}

/** How many documents the catch-up would read. */
export function catchUpCount(householdId: string, db: Db = getDb()): number {
  return (
    billsMissingMetrics(householdId, db).length + documentsMissingDates(householdId, db).length
  );
}

async function readWithAi(
  householdId: string,
  doc: SourceDocument,
  db: Db,
): Promise<ExtractionResult | null | undefined> {
  let text = '';
  try {
    text = await extractText(readDocument(doc), doc.mimeType, doc.originalFilename);
  } catch {
    return undefined;
  }
  const found = text.trim().length < 20 ? await scanFor(doc) : null;
  const file = found && 'file' in found ? found.file : null;
  const input = { ...buildInput(householdId, text, doc, db), file };
  if (!fallbackExtractors.some((e) => e.canHandle(input))) return undefined;
  const { best, attempts } = await runExtractors(input, { extractors: fallbackExtractors });
  if (attempts.some((a) => !a.error)) recordUsage(householdId, AI_READ, db);
  return best;
}

export async function readMissingMetrics(
  householdId: string,
  db: Db = getDb(),
): Promise<{ read: number; withFigures: number; dated: number }> {
  const out = { read: 0, withFigures: 0, dated: 0 };
  if (running.has(householdId)) return out;
  running.add(householdId);
  try {
    for (const b of billsMissingMetrics(householdId, db)) {
      if (aiAllowance(householdId, db).left <= 0) return out;
      const doc = getDocument(householdId, b.sourceDocumentId, db);
      if (!doc) continue;
      const best = await readWithAi(householdId, doc, db);
      if (best === undefined) continue;
      out.read++;
      // A reading with no figures still counts, so the bill isn't read again.
      if (best?.bill.metrics && saveBillMetrics(householdId, b.id, best.bill.metrics, db))
        out.withFigures++;
    }
    for (const doc of documentsMissingDates(householdId, db)) {
      if (aiAllowance(householdId, db).left <= 0) return out;
      const best = await readWithAi(householdId, doc, db);
      if (best === undefined) continue;
      out.read++;
      if (!doc.extractionJson) continue;
      const date = best?.document?.date ?? best?.bill.issueDate;
      // No date printed: keep it under its arrival day, and don't read it again.
      const stored = JSON.parse(doc.extractionJson) as Record<string, unknown>;
      stored.documentDate = date || doc.receivedAt.slice(0, 10);
      setDocumentStatus(householdId, doc.id, doc.status, JSON.stringify(stored), db);
      if (date) out.dated++;
    }
  } finally {
    running.delete(householdId);
  }
  return out;
}
