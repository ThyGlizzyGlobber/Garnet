import fs from 'node:fs';
import path from 'node:path';
import type { SourceDocument } from '@/db/schema';
import { dataPaths } from '@/lib/paths';
import { documentPath, readDocument } from './archive';
import { isPdfFile } from './scan';

/**
 * A bill's document on its page (scope D8): the real first page of a PDF,
 * drawn once as a PNG and kept beside the file in DATA_DIR/previews/, so
 * the page never renders a PDF twice. Photos are shown as they are; emails
 * and anything that can't be drawn get the stand-in page instead.
 */
const PREVIEW_WIDTH = 900;

function previewPath(doc: Pick<SourceDocument, 'id'>): string {
  return path.join(dataPaths().root, 'previews', `${doc.id}.png`);
}

/** Renders drawn one at a time: two requests for the same page share one drawing. */
const drawing = new Map<string, Promise<Buffer | null>>();

/**
 * The PNG of a PDF's first page, drawing it the first time (or again after
 * the file changed, e.g. a page was turned). Null when the document isn't a
 * PDF or can't be drawn.
 */
export async function documentPreview(
  doc: Pick<SourceDocument, 'id' | 'path' | 'mimeType'>,
): Promise<Buffer | null> {
  if (!isPdfFile(doc.mimeType, doc.path)) return null;
  const out = previewPath(doc);
  try {
    const src = fs.statSync(documentPath(doc));
    const have = fs.statSync(out);
    if (have.mtimeMs >= src.mtimeMs && have.size > 0) return fs.readFileSync(out);
  } catch {
    // Not drawn yet.
  }
  let p = drawing.get(doc.id);
  if (!p) {
    p = draw(doc, out).finally(() => drawing.delete(doc.id));
    drawing.set(doc.id, p);
  }
  return p;
}

async function draw(doc: Pick<SourceDocument, 'id' | 'path'>, out: string): Promise<Buffer | null> {
  try {
    const { PDFParse } = await import('pdf-parse');
    const parser = new PDFParse({ data: new Uint8Array(readDocument(doc)) });
    try {
      const shot = await parser.getScreenshot({
        first: 1,
        desiredWidth: PREVIEW_WIDTH,
        imageBuffer: true,
        imageDataUrl: false,
      });
      const page = shot.pages[0];
      if (!page?.data?.length) return null;
      const png = Buffer.from(page.data);
      fs.mkdirSync(path.dirname(out), { recursive: true });
      const tmp = `${out}.${process.pid}.tmp`;
      fs.writeFileSync(tmp, png);
      fs.renameSync(tmp, out);
      return png;
    } finally {
      await parser.destroy();
    }
  } catch (e) {
    console.warn(`[preview] ${doc.id}: ${(e as Error).message}`);
    return null;
  }
}
