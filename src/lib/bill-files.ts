import { getDb, type Db } from '@/db/client';
import type { SourceDocument } from '@/db/schema';
import { canRotate } from '@/ingest/rotate';
import { isImageFile, isPdfFile } from '@/ingest/scan';
import { actingMember } from '@/lib/acting-member';
import { filedDocuments, type FiledDocument } from '@/lib/filing';
import { listMembers } from '@/lib/members';

/**
 * A bill's files as its page shows them: the file it was read from, then any
 * receipts and payment notices about it, each with how it reached the
 * household and how it opens.
 */

/** How a file reached the household: uploaded, forwarded by a member, or emailed in. */
type Arrival =
  | { kind: 'upload'; name: string | null }
  | { kind: 'forward'; name: string; from: string | null }
  | { kind: 'email'; from: string | null };

/** How a stored file opens: as a PDF, a photo, or an email (its text). */
export type FileView = 'pdf' | 'photo' | 'email';

export function fileView(doc: Pick<SourceDocument, 'mimeType' | 'path'>): FileView {
  return isPdfFile(doc.mimeType, doc.path)
    ? 'pdf'
    : isImageFile(doc.mimeType, doc.path)
      ? 'photo'
      : 'email';
}

export type BillFile = FiledDocument & { arrival: Arrival; view: FileView; canTurn: boolean };

export function billFiles(householdId: string, billId: string, db: Db = getDb()): BillFile[] {
  const names = new Map(listMembers(householdId, db).map((m) => [m.id, m.name]));
  const arrival = (doc: SourceDocument): Arrival => {
    if (doc.kind === 'upload')
      return { kind: 'upload', name: (doc.memberId && names.get(doc.memberId)) || null };
    const member = actingMember(householdId, doc, db);
    if (member) return { kind: 'forward', name: names.get(member) ?? '', from: doc.emailFrom };
    return { kind: 'email', from: doc.emailFrom };
  };
  return filedDocuments(householdId, { everyone: true }, db)
    .filter((f) => f.billId === billId)
    .sort((x, y) =>
      x.kind === 'bill'
        ? -1
        : y.kind === 'bill'
          ? 1
          : x.doc.receivedAt.localeCompare(y.doc.receivedAt),
    )
    .map((f) => ({
      ...f,
      arrival: arrival(f.doc),
      view: fileView(f.doc),
      canTurn: canRotate(f.doc),
    }));
}

/**
 * A bill's notes as a person wrote them. Bills read by the AI used to carry the
 * reader's own remarks in their notes; those aren't for people, so notes that
 * are exactly what the reader said about its source file are left out.
 */
export function personNotes(notes: string | null, source: SourceDocument | null): string | null {
  if (!notes?.trim()) return null;
  try {
    const read = source?.extractionJson
      ? (JSON.parse(source.extractionJson) as { result?: { warnings?: string[] } })
      : null;
    const said = read?.result?.warnings ?? [];
    if (said.length && said.join('\n').trim() === notes.trim()) return null;
  } catch {
    // Unreadable record: show the notes.
  }
  return notes;
}
