import { and, asc, eq, isNotNull, isNull } from 'drizzle-orm';
import { getDb, type Db } from '@/db/client';
import { bill, service } from '@/db/schema';
import { getDocument } from './archive';
import { actingMember } from '@/lib/acting-member';

/**
 * "Who's this for?" is asked of whoever brought the service's bill in. Services
 * marked for asking by an update (0027/0028) didn't record who that was, so the
 * question fell back to the admins. Work it out from the service's first bill:
 * whoever uploaded it, or the member a signed forward came from. Services whose
 * first bill came straight from a provider still go to the admins. A one-off
 * upgrade step (src/worker/startup.ts); returns how many were filled in.
 */
export function adoptSetUpBy(db: Db = getDb()): number {
  const waiting = db
    .select({ id: service.id, householdId: service.householdId })
    .from(service)
    .where(
      and(
        isNotNull(service.ownerAskedAt),
        isNull(service.ownerConfirmedAt),
        isNull(service.setUpByMemberId),
      ),
    )
    .all();
  let filled = 0;
  for (const s of waiting) {
    const first = db
      .select({ docId: bill.sourceDocumentId })
      .from(bill)
      .where(and(eq(bill.serviceId, s.id), isNotNull(bill.sourceDocumentId)))
      .orderBy(asc(bill.createdAt))
      .get();
    const doc = first?.docId ? getDocument(s.householdId, first.docId, db) : null;
    const member = doc ? actingMember(s.householdId, doc, db) : null;
    if (!member) continue;
    db.update(service).set({ setUpByMemberId: member }).where(eq(service.id, s.id)).run();
    filled++;
  }
  return filled;
}
