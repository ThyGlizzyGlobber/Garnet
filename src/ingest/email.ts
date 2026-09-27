import { simpleParser } from 'mailparser';
import { getDb, type Db } from '@/db/client';
import { archiveDocument, setDocumentStatus } from './archive';
import { processDocument, type PipelineOutcome } from './pipeline';

export interface ArchivedEmail {
  /** New documents written (the .eml and any PDFs not seen before). */
  archived: number;
  /** Documents to run through the pipeline: new PDFs, or the email itself when it has none. */
  toProcess: string[];
}

/**
 * Keep a raw email for a household: the .eml always (audit trail), plus each PDF
 * attachment as its own document. With PDFs the .eml is only the envelope and is
 * marked ignored; without, the email body is the bill. Same bytes twice → no-op.
 */
export async function archiveEmail(
  householdId: string,
  source: Buffer,
  receivedAt: string,
  db: Db = getDb(),
  sender?: { domain: string | null; verified: boolean },
): Promise<ArchivedEmail> {
  const parsed = await simpleParser(source);
  const from = parsed.from?.text ?? null;
  const subject = parsed.subject ?? null;
  const messageId = parsed.messageId ?? null;
  const meta = {
    receivedAt,
    emailFrom: from,
    emailSubject: subject,
    emailMessageId: messageId,
    ...(sender ? { senderDomain: sender.domain, senderVerified: sender.verified } : {}),
  };
  const { doc: emailDoc, duplicate } = archiveDocument(
    householdId,
    {
      kind: 'email',
      buffer: source,
      originalFilename: `${subject ?? 'message'}.eml`,
      mimeType: 'message/rfc822',
      ...meta,
    },
    db,
  );
  const out: ArchivedEmail = { archived: duplicate ? 0 : 1, toProcess: [] };
  const pdfs = (parsed.attachments ?? []).filter(
    (a) => a.contentType === 'application/pdf' || (a.filename ?? '').toLowerCase().endsWith('.pdf'),
  );
  if (!pdfs.length) {
    if (!duplicate) out.toProcess.push(emailDoc.id);
    return out;
  }
  for (const a of pdfs) {
    const { doc, duplicate: dupPdf } = archiveDocument(
      householdId,
      {
        kind: 'pdf',
        buffer: a.content,
        originalFilename: a.filename ?? 'attachment.pdf',
        mimeType: 'application/pdf',
        ...meta,
      },
      db,
    );
    if (!dupPdf) {
      out.archived++;
      out.toProcess.push(doc.id);
    }
  }
  if (!duplicate)
    setDocumentStatus(
      householdId,
      emailDoc.id,
      'ignored',
      JSON.stringify({ reason: 'Envelope for PDF attachment(s)' }),
      db,
    );
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
