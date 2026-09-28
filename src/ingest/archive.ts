import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { and, eq, like, or } from 'drizzle-orm';
import { getDb, type Db } from '@/db/client';
import { bill, sourceDocument, type SourceDocument } from '@/db/schema';
import { ulid } from '@/lib/ids';
import { dataPaths, ensureDataDirs } from '@/lib/paths';

export interface ArchiveInput {
  kind: 'email' | 'pdf' | 'upload';
  buffer: Buffer;
  originalFilename?: string | null;
  mimeType?: string | null;
  receivedAt?: string;
  emailFrom?: string | null;
  emailSubject?: string | null;
  emailMessageId?: string | null;
  /** Set for mail that arrived at a household bills address. */
  senderDomain?: string | null;
  senderVerified?: boolean | null;
}

export function sha256(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}

function safeName(name: string | null | undefined, fallbackExt: string): string {
  const base = (name ?? '')
    .replace(/[^\w.-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80);
  return base || `document${fallbackExt}`;
}

function extFor(mime: string | null | undefined, name: string | null | undefined): string {
  const n = (name ?? '').toLowerCase();
  if (n.includes('.')) return '';
  if ((mime ?? '').includes('pdf')) return '.pdf';
  if ((mime ?? '').includes('html')) return '.html';
  if ((mime ?? '').includes('rfc822')) return '.eml';
  const image = (mime ?? '').match(/^image\/(jpeg|png|webp|gif|heic|heif)$/i)?.[1]?.toLowerCase();
  if (image) return image === 'jpeg' ? '.jpg' : `.${image}`;
  return '.bin';
}

/**
 * Write a raw bill file under DATA_DIR/inbox/YYYY/MM/ and record it. Bill files
 * are never deleted. Returns the existing record when the same bytes were seen before.
 */
export function archiveDocument(
  householdId: string,
  input: ArchiveInput,
  db: Db = getDb(),
): { doc: SourceDocument; duplicate: boolean } {
  const hash = sha256(input.buffer);
  const existing = db
    .select()
    .from(sourceDocument)
    .where(and(eq(sourceDocument.householdId, householdId), eq(sourceDocument.sha256, hash)))
    .get();
  if (existing) return { doc: existing, duplicate: true };

  const receivedAt = input.receivedAt ?? new Date().toISOString();
  const id = ulid();
  const rel = path.join(
    receivedAt.slice(0, 4),
    receivedAt.slice(5, 7),
    `${id}-${safeName(input.originalFilename, extFor(input.mimeType, input.originalFilename))}${extFor(input.mimeType, input.originalFilename)}`,
  );
  const paths = ensureDataDirs();
  const abs = path.join(paths.inbox, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, input.buffer, { flag: 'wx' });

  const row: SourceDocument = {
    id,
    householdId,
    kind: input.kind,
    path: rel,
    originalFilename: input.originalFilename ?? null,
    mimeType: input.mimeType ?? null,
    sha256: hash,
    sizeBytes: input.buffer.length,
    receivedAt,
    emailFrom: input.emailFrom ?? null,
    emailSubject: input.emailSubject ?? null,
    emailMessageId: input.emailMessageId ?? null,
    senderDomain: input.senderDomain ?? null,
    senderVerified: input.senderVerified ?? null,
    status: 'unprocessed',
    extractionJson: null,
    createdAt: receivedAt,
  };
  db.insert(sourceDocument).values(row).run();
  return { doc: row, duplicate: false };
}

export function documentPath(doc: Pick<SourceDocument, 'path'>): string {
  return path.join(dataPaths().inbox, doc.path);
}

export function readDocument(doc: Pick<SourceDocument, 'path'>): Buffer {
  return fs.readFileSync(documentPath(doc));
}

export function getDocument(
  householdId: string,
  id: string,
  db: Db = getDb(),
): SourceDocument | null {
  return (
    db
      .select()
      .from(sourceDocument)
      .where(and(eq(sourceDocument.householdId, householdId), eq(sourceDocument.id, id)))
      .get() ?? null
  );
}

export function setDocumentStatus(
  householdId: string,
  id: string,
  status: SourceDocument['status'],
  extractionJson: string | null | undefined,
  db: Db = getDb(),
): void {
  db.update(sourceDocument)
    .set({ status, ...(extractionJson !== undefined ? { extractionJson } : {}) })
    .where(and(eq(sourceDocument.householdId, householdId), eq(sourceDocument.id, id)))
    .run();
}

/**
 * Forwarded emails used to be kept as "envelopes" beside their PDFs. They're no
 * longer stored, so remove any left from before (row and file). Only envelopes
 * no bill points at; safe to run on every start.
 */
export function purgeEmailEnvelopes(db: Db = getDb()): number {
  const envelopes = db
    .select()
    .from(sourceDocument)
    .where(
      and(
        eq(sourceDocument.kind, 'email'),
        eq(sourceDocument.status, 'ignored'),
        like(sourceDocument.extractionJson, '%Envelope for PDF attachment%'),
      ),
    )
    .all();
  let removed = 0;
  for (const doc of envelopes) {
    const used = db
      .select({ id: bill.id })
      .from(bill)
      .where(or(eq(bill.sourceDocumentId, doc.id), eq(bill.alertDocumentId, doc.id)))
      .get();
    if (used) continue;
    db.delete(sourceDocument).where(eq(sourceDocument.id, doc.id)).run();
    fs.rmSync(documentPath(doc), { force: true });
    removed++;
  }
  return removed;
}
