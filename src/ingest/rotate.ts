import fs from 'node:fs';
import path from 'node:path';
import { and, eq } from 'drizzle-orm';
import { getDb, type Db } from '@/db/client';
import { sourceDocument, type SourceDocument } from '@/db/schema';
import { dataPaths } from '@/lib/paths';
import { documentPath, getDocument } from './archive';
import { isImageFile } from './scan';

/**
 * Turning scans the right way up, for good. The AI reader says when a scanned
 * page or photo is sideways or upside down; a person can also turn it from the
 * bill page. The stored file is replaced by the upright one so every viewer,
 * export and later read sees it upright; the file exactly as it arrived is
 * kept once, under DATA_DIR/originals/, as the audit trail.
 *
 * PDFs: only each page's rotation setting changes (its content is untouched).
 * Photos: re-saved upright (EXIF orientation applied, then turned).
 */

export type Degrees = 90 | 180 | 270;

/** How far to turn each page, clockwise: 1-based page → degrees. */
export type PageTurns = { page: number; degrees: Degrees }[];

export const isDegrees = (n: unknown): n is Degrees => n === 90 || n === 180 || n === 270;

function isPdfDoc(doc: Pick<SourceDocument, 'mimeType' | 'path' | 'originalFilename'>): boolean {
  return (
    (doc.mimeType ?? '').includes('pdf') ||
    doc.path.toLowerCase().endsWith('.pdf') ||
    /\.pdf$/i.test(doc.originalFilename ?? '')
  );
}

/** Can this document be turned (a PDF or an ordinary photo)? */
export function canRotate(doc: Pick<SourceDocument, 'mimeType' | 'path' | 'originalFilename'>) {
  return (
    isPdfDoc(doc) ||
    (isImageFile(doc.mimeType, doc.path) && !/heic|heif|gif/i.test(`${doc.mimeType} ${doc.path}`))
  );
}

/** Where the file as it arrived is kept (once, before its first turn). */
export function originalPath(doc: Pick<SourceDocument, 'id' | 'path'>): string {
  return path.join(dataPaths().root, 'originals', `${doc.id}${path.extname(doc.path)}`);
}

async function turnPdf(data: Buffer, turns: PageTurns | Degrees): Promise<Buffer> {
  const { PDFDocument, degrees } = await import('pdf-lib');
  const pdf = await PDFDocument.load(data, { ignoreEncryption: true, updateMetadata: false });
  pdf.getPages().forEach((page, i) => {
    const by = typeof turns === 'number' ? turns : turns.find((t) => t.page === i + 1)?.degrees;
    if (!by) return;
    page.setRotation(degrees((page.getRotation().angle + by) % 360));
  });
  return Buffer.from(await pdf.save({ updateFieldAppearances: false }));
}

async function turnPhoto(data: Buffer, by: Degrees, ext: string): Promise<Buffer> {
  const { default: sharp } = await import('sharp');
  const img = sharp(data).autoOrient().rotate(by);
  if (ext === '.png') return img.png().toBuffer();
  if (ext === '.webp') return img.webp({ quality: 92 }).toBuffer();
  return img.jpeg({ quality: 92, mozjpeg: true }).toBuffer();
}

/**
 * Turn a stored document: every page by the same amount (a number), or
 * page by page. Returns false when there was nothing to turn or it can't be.
 */
export async function rotateDocument(
  householdId: string,
  documentId: string,
  turns: PageTurns | Degrees,
  db: Db = getDb(),
): Promise<boolean> {
  const doc = getDocument(householdId, documentId, db);
  if (!doc || !canRotate(doc)) return false;
  if (Array.isArray(turns) && !turns.length) return false;
  const file = documentPath(doc);
  const data = fs.readFileSync(file);
  let turned: Buffer;
  if (isPdfDoc(doc)) turned = await turnPdf(data, turns);
  else {
    // A photo is one page.
    const by = typeof turns === 'number' ? turns : turns.find((t) => t.page === 1)?.degrees;
    if (!by) return false;
    turned = await turnPhoto(data, by, path.extname(doc.path).toLowerCase());
  }
  // Keep the file exactly as it arrived, once, before it's first changed.
  const original = originalPath(doc);
  if (!fs.existsSync(original)) {
    fs.mkdirSync(path.dirname(original), { recursive: true });
    fs.copyFileSync(file, original);
  }
  // Replace atomically: a half-written file is never left in its place.
  const tmp = `${file}.turning`;
  fs.writeFileSync(tmp, turned);
  fs.renameSync(tmp, file);
  // sha256 stays the original's, so the same file sent again is still recognised.
  db.update(sourceDocument)
    .set({ sizeBytes: turned.length })
    .where(and(eq(sourceDocument.householdId, householdId), eq(sourceDocument.id, doc.id)))
    .run();
  return true;
}
