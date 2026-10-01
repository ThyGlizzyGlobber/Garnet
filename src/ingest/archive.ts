import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { and, eq, like, or } from 'drizzle-orm';
import { getDb, type Db } from '@/db/client';
import { bill, sourceDocument, type SourceDocument } from '@/db/schema';
import { deleteBill } from '@/lib/bills';
import { ulid } from '@/lib/ids';
import { openFor, sealFor } from '@/lib/crypto';
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
  /** The member who uploaded it. */
  memberId?: string | null;
}

function sha256(buffer: Buffer): string {
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
  // Sealed with the household's key when the install has one (src/lib/crypto.ts).
  fs.writeFileSync(abs, sealFor(householdId, input.buffer, db), { flag: 'wx' });

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
    memberId: input.memberId ?? null,
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

/** A document's bytes as they were received (opened with the household's key when sealed). */
export function readDocument(
  doc: Pick<SourceDocument, 'householdId' | 'path'>,
  db: Db = getDb(),
): Buffer {
  return openFor(doc.householdId, fs.readFileSync(documentPath(doc)), db);
}

/** Replace a stored file's bytes atomically, sealed for the household when the install has a key. */
export function writeStoredFile(
  householdId: string,
  abs: string,
  plain: Buffer,
  db: Db = getDb(),
): void {
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  const tmp = `${abs}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, sealFor(householdId, plain, db));
  fs.renameSync(tmp, abs);
}

/** A stored file's bytes (a preview, an original), opened with the household's key when sealed. */
export function readStoredFile(householdId: string, abs: string, db: Db = getDb()): Buffer {
  return openFor(householdId, fs.readFileSync(abs), db);
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
 * no bill points at. A one-off upgrade step (src/worker/startup.ts).
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
    if (billUses(doc.id, db)) continue;
    db.delete(sourceDocument).where(eq(sourceDocument.id, doc.id)).run();
    fs.rmSync(documentPath(doc), { force: true });
    removed++;
  }
  return removed;
}

/** Is any bill still made from, or flagged by, this document? */
function billUses(docId: string, db: Db): boolean {
  return !!db
    .select({ id: bill.id })
    .from(bill)
    .where(or(eq(bill.sourceDocumentId, docId), eq(bill.alertDocumentId, docId)))
    .get();
}

/** Remove a document for good, row and file, unless a bill still uses it. */
/** Where a scan's file is kept exactly as it arrived, once it has been turned upright. */
export function originalPath(doc: Pick<SourceDocument, 'id' | 'path'>): string {
  return path.join(dataPaths().root, 'originals', `${doc.id}${path.extname(doc.path)}`);
}

function deleteDocument(householdId: string, id: string, db: Db = getDb()): boolean {
  const doc = getDocument(householdId, id, db);
  if (!doc || billUses(doc.id, db)) return false;
  db.delete(sourceDocument)
    .where(and(eq(sourceDocument.householdId, householdId), eq(sourceDocument.id, id)))
    .run();
  fs.rmSync(documentPath(doc), { force: true });
  // The file as it arrived goes too: deleting a bill deletes its file (owner).
  fs.rmSync(originalPath(doc), { force: true });
  // And its drawn first page (see src/ingest/preview.ts).
  fs.rmSync(path.join(dataPaths().root, 'previews', `${doc.id}.png`), { force: true });
  return true;
}

/**
 * Deleting a bill deletes it fully (owner): the bill, its shares and figures,
 * and the PDF or email it was read from, so nothing is left behind in the
 * Inbox. Forwarding the same file again later reads it afresh.
 */
export function deleteBillWithDocument(
  householdId: string,
  billId: string,
  db: Db = getDb(),
): void {
  const row = db
    .select({ sourceDocumentId: bill.sourceDocumentId })
    .from(bill)
    .where(and(eq(bill.householdId, householdId), eq(bill.id, billId)))
    .get();
  if (!row) return;
  // Shares and figures go with the bill (ON DELETE CASCADE); the service's
  // other bills are re-checked for Unusual.
  deleteBill(householdId, billId, db);
  if (row.sourceDocumentId) deleteDocument(householdId, row.sourceDocumentId, db);
}

/**
 * Documents left behind by bills deleted before deleting a bill removed its
 * document too: marked "Bill created" but no bill uses them. A one-off upgrade
 * step (src/worker/startup.ts).
 */
export function purgeOrphanedBillDocuments(db: Db = getDb()): number {
  const created = db
    .select()
    .from(sourceDocument)
    .where(eq(sourceDocument.status, 'extracted'))
    .all();
  let removed = 0;
  for (const doc of created)
    if (!billUses(doc.id, db) && deleteDocument(doc.householdId, doc.id, db)) removed++;
  return removed;
}
