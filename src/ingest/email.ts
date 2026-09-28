import { simpleParser } from 'mailparser';
import { getDb, type Db } from '@/db/client';
import { archiveDocument } from './archive';
import { isImageFile } from './scan';
import { processDocument, type PipelineOutcome } from './pipeline';

export interface ArchivedEmail {
  /** New documents written (the PDFs, or the email when it has none). */
  archived: number;
  /** Documents to run through the pipeline: new PDFs, or the email itself when it has none. */
  toProcess: string[];
}

/**
 * Keep what a household's email brought in. With PDF attachments (or, failing
 * those, photos of a paper bill), only the attachments are kept, each as its own document carrying the email's sender and subject;
 * the email itself isn't stored (owner decision: forwards are just envelopes).
 * Without PDFs the email is the bill (or notice) and is kept. Same bytes twice → no-op.
 */
export async function archiveEmail(
  householdId: string,
  source: Buffer,
  receivedAt: string,
  db: Db = getDb(),
  sender?: { domain: string | null; verified: boolean },
): Promise<ArchivedEmail> {
  const parsed = await simpleParser(source);
  const subject = parsed.subject ?? null;
  const meta = {
    receivedAt,
    emailFrom: parsed.from?.text ?? null,
    emailSubject: subject,
    emailMessageId: parsed.messageId ?? null,
    ...(sender ? { senderDomain: sender.domain, senderVerified: sender.verified } : {}),
  };
  const out: ArchivedEmail = { archived: 0, toProcess: [] };
  const pdfs = (parsed.attachments ?? []).filter(
    (a) => a.contentType === 'application/pdf' || (a.filename ?? '').toLowerCase().endsWith('.pdf'),
  );
  // A photo of a paper bill: an attached picture, not a logo or signature
  // (those are embedded in the HTML, or tiny).
  const photos = pdfs.length
    ? []
    : (parsed.attachments ?? []).filter(
        (a) =>
          isImageFile(a.contentType, a.filename) && !a.related && a.content.length >= 30 * 1024,
      );
  const files = pdfs.length
    ? pdfs.map((a) => ({
        kind: 'pdf' as const,
        buffer: a.content,
        originalFilename: a.filename ?? 'attachment.pdf',
        mimeType: 'application/pdf',
      }))
    : photos.length
      ? photos.map((a) => ({
          kind: 'pdf' as const,
          buffer: a.content,
          originalFilename: a.filename ?? 'photo.jpg',
          mimeType: a.contentType,
        }))
      : [
          {
            kind: 'email' as const,
            buffer: source,
            originalFilename: `${subject ?? 'message'}.eml`,
            mimeType: 'message/rfc822',
          },
        ];
  for (const f of files) {
    const { doc, duplicate } = archiveDocument(householdId, { ...f, ...meta }, db);
    if (!duplicate) {
      out.archived++;
      out.toProcess.push(doc.id);
    }
  }
  return out;
}

/** Archive, then run the pipeline on what needs reading. */
export async function ingestEmail(
  householdId: string,
  source: Buffer,
  receivedAt: string,
  db: Db = getDb(),
): Promise<{ archived: number; outcomes: PipelineOutcome[] }> {
  const { archived, toProcess } = await archiveEmail(householdId, source, receivedAt, db);
  const outcomes: PipelineOutcome[] = [];
  for (const id of toProcess) outcomes.push(await processDocument(householdId, id, db));
  return { archived, outcomes };
}
