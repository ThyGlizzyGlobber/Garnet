import { getDb, type Db } from '@/db/client';
import { billsMissingMetrics, saveBillMetrics } from '@/lib/metrics';
import { AI_READ, aiAllowance, recordUsage } from '@/lib/usage';
import { getDocument, readDocument } from './archive';
import { fallbackExtractors } from './extractors';
import { buildInput, runExtractors } from './pipeline';
import { scanFor } from './scan';
import { extractText } from './text';

const running = new Set<string>();

export function isReadingMetrics(householdId: string): boolean {
  return running.has(householdId);
}

/**
 * Bills read before figures were kept: read their source document again with
 * the AI and store what it finds. Only the figures change, never the bill. Each
 * bill is one AI read against the month's limit; stops when that runs out.
 */
export async function readMissingMetrics(
  householdId: string,
  db: Db = getDb(),
): Promise<{ read: number; withFigures: number }> {
  const out = { read: 0, withFigures: 0 };
  if (running.has(householdId)) return out;
  running.add(householdId);
  try {
    for (const b of billsMissingMetrics(householdId, db)) {
      if (aiAllowance(householdId, db).left <= 0) break;
      const doc = getDocument(householdId, b.sourceDocumentId, db);
      if (!doc) continue;
      let text = '';
      try {
        text = await extractText(readDocument(doc), doc.mimeType, doc.originalFilename);
      } catch {
        continue;
      }
      const found = text.trim().length < 20 ? await scanFor(doc) : null;
      const file = found && 'file' in found ? found.file : null;
      const input = { ...buildInput(householdId, text, doc, db), file };
      if (!fallbackExtractors.some((e) => e.canHandle(input))) continue;
      const { best, attempts } = await runExtractors(input, { extractors: fallbackExtractors });
      if (attempts.some((a) => !a.error)) recordUsage(householdId, AI_READ, db);
      out.read++;
      // A reading with no figures still counts, so the bill isn't read again.
      if (best?.bill.metrics && saveBillMetrics(householdId, b.id, best.bill.metrics, db))
        out.withFigures++;
    }
  } finally {
    running.delete(householdId);
  }
  return out;
}
