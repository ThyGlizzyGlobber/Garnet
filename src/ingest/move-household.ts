import { eq } from 'drizzle-orm';
import { getDb, type Db } from '@/db/client';
import { bill, type Member, type SourceDocument } from '@/db/schema';
import { membershipsFor } from '@/lib/accounts';
import { getHousehold } from '@/lib/households';
import {
  archiveDocument,
  deleteBillWithDocument,
  deleteDocument,
  getDocument,
  readDocument,
} from './archive';

/**
 * The other households a person may move a document to: every household their
 * account belongs to except this one, demo and real never mixed.
 */
export function moveTargets(me: Member, db: Db = getDb()): { member: Member; name: string }[] {
  const here = getHousehold(me.householdId, db);
  if (!me.accountId) return [];
  return membershipsFor(me.accountId, db)
    .filter((m) => m.householdId !== me.householdId)
    .map((m) => ({ m, hh: getHousehold(m.householdId, db) }))
    .filter(({ hh }) => hh && hh.isDemo === here?.isDemo)
    .map(({ m, hh }) => ({ member: m, name: hh!.name }));
}

export type MoveOutcome =
  | { ok: true; doc: SourceDocument; duplicate: boolean }
  | { ok: false; reason: 'notFound' | 'notice' };

/**
 * Move a document, and the bill made from it, to another of the person's
 * households (owner: a bill forwarded or uploaded into the wrong household).
 * The file is copied into the other household first (sealed with its key),
 * then the bill and document here are deleted, so nothing is lost if a step
 * fails. The copy counts as brought in by the person moving it, as "It's a
 * bill" does: they vouch for it. The caller reads it there afterwards.
 */
export function moveDocumentToHousehold(
  householdId: string,
  documentId: string,
  to: Member,
  db: Db = getDb(),
): MoveOutcome {
  const doc = getDocument(householdId, documentId, db);
  if (!doc || to.householdId === householdId) return { ok: false, reason: 'notFound' };
  // A receipt or notice that updated a bill here belongs with that bill.
  if (db.select({ id: bill.id }).from(bill).where(eq(bill.alertDocumentId, doc.id)).get())
    return { ok: false, reason: 'notice' };
  const made = db.select({ id: bill.id }).from(bill).where(eq(bill.sourceDocumentId, doc.id)).get();

  const { doc: copy, duplicate } = archiveDocument(
    to.householdId,
    {
      kind: doc.kind,
      buffer: readDocument(doc, db),
      originalFilename: doc.originalFilename,
      mimeType: doc.mimeType,
      receivedAt: doc.receivedAt,
      emailFrom: doc.emailFrom,
      emailSubject: doc.emailSubject,
      emailMessageId: doc.emailMessageId,
      senderDomain: doc.senderDomain,
      senderVerified: null,
      memberId: to.id,
    },
    db,
  );

  if (made) deleteBillWithDocument(householdId, made.id, db);
  else deleteDocument(householdId, doc.id, db);
  return { ok: true, doc: copy, duplicate };
}
