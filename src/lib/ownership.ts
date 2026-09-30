import { and, eq, isNotNull, isNull } from 'drizzle-orm';
import { getDb, type Db } from '@/db/client';
import { bill, service, sourceDocument } from '@/db/schema';
import { actingMember } from '@/lib/acting-member';
import { setServiceOwner } from '@/lib/bills';
import { getService, listServices, type ServiceWithType } from '@/lib/services';
import { visibleTo } from '@/lib/scope';
import { isAdmin } from '@/lib/roles';

/**
 * "Who's this for?" A service set up automatically from someone's bill is
 * household or personal by its type (car rego: theirs), but the type can't
 * always tell (a phone plan, an AI that filed rego as "Other"). So whoever
 * brought the bill in is asked once, on the bill's page and on Home, with the
 * type's guess already chosen. Services nobody knows the origin of are asked
 * of the household's admins. Households that don't split bills are never asked.
 */

export interface OwnershipQuestion {
  service: ServiceWithType;
  /** The bill to open to answer it (the service's latest). */
  billId: string | null;
}

/** Is this member the one to ask about this service? */
export function asksMember(
  svc: Pick<
    ServiceWithType,
    'ownerAskedAt' | 'ownerConfirmedAt' | 'setUpByMemberId' | 'ownerMemberId'
  >,
  me: { id: string; role: string },
): boolean {
  if (!svc.ownerAskedAt || svc.ownerConfirmedAt) return false;
  if (!visibleTo(svc.ownerMemberId, me.id)) return false;
  return svc.setUpByMemberId ? svc.setUpByMemberId === me.id : isAdmin(me);
}

/** The services this member should say "mine or the household's" about. */
export function ownershipQuestions(
  householdId: string,
  me: { id: string; role: string },
  db: Db = getDb(),
): OwnershipQuestion[] {
  const pending = db
    .select({ id: service.id })
    .from(service)
    .where(
      and(
        eq(service.householdId, householdId),
        isNotNull(service.ownerAskedAt),
        isNull(service.ownerConfirmedAt),
      ),
    )
    .all()
    .map((r) => r.id);
  if (!pending.length) return [];
  return listServices(householdId, { includeInactive: true, viewer: me.id }, db)
    .filter((s) => pending.includes(s.id) && asksMember(s, me))
    .map((s) => ({
      service: s,
      billId:
        db
          .select({ id: bill.id })
          .from(bill)
          .where(and(eq(bill.householdId, householdId), eq(bill.serviceId, s.id)))
          .orderBy(bill.createdAt)
          .all()
          .at(-1)?.id ?? null,
    }));
}

/**
 * Answer the question: "mine" makes the service (and its bills) this member's
 * own; "household" makes it the household's. When housemates have already paid
 * shares it has to stay the household's; the answer is still recorded.
 */
export function answerOwnership(
  householdId: string,
  serviceId: string,
  me: { id: string; role: string },
  answer: 'mine' | 'household',
  db: Db = getDb(),
): { ok: boolean; reason?: string } {
  const svc = getService(householdId, serviceId, db);
  if (!svc || !visibleTo(svc.ownerMemberId, me.id)) return { ok: false, reason: 'not-found' };
  let result: { ok: boolean; reason?: string } = { ok: true };
  try {
    setServiceOwner(householdId, serviceId, answer === 'mine' ? me.id : null, db);
  } catch (e) {
    result = { ok: false, reason: (e as Error).message };
  }
  confirmOwnership(householdId, serviceId, db);
  return result;
}

/** Nobody needs asking about this service any more (answered, or set in its form). */
export function confirmOwnership(householdId: string, serviceId: string, db: Db = getDb()): void {
  db.update(service)
    .set({ ownerConfirmedAt: new Date().toISOString() })
    .where(and(eq(service.householdId, householdId), eq(service.id, serviceId)))
    .run();
}

/**
 * Who brought each of this service's bills in: the member who uploaded its file,
 * forwarded it from their own address or entered it by hand, or null when
 * nobody is known to have (mail straight from the provider, older entries).
 */
function billBringers(householdId: string, serviceId: string, db: Db): (string | null)[] {
  return db
    .select({
      createdBy: bill.createdByMemberId,
      memberId: sourceDocument.memberId,
      senderVerified: sourceDocument.senderVerified,
      emailFrom: sourceDocument.emailFrom,
    })
    .from(bill)
    .leftJoin(sourceDocument, eq(sourceDocument.id, bill.sourceDocumentId))
    .where(and(eq(bill.householdId, householdId), eq(bill.serviceId, serviceId)))
    .all()
    .map((d) => actingMember(householdId, d, db) ?? d.createdBy);
}

/** The members who brought any of this service's bills in (upload or forward). */
export function broughtInBy(householdId: string, serviceId: string, db: Db = getDb()): Set<string> {
  return new Set(billBringers(householdId, serviceId, db).filter((m): m is string => !!m));
}

/**
 * May this member switch a service between household and personal? Its owner
 * can hand a personal one back. A household one can be made theirs by whoever
 * set it up, or by whoever brought every one of its bills in (their own rego,
 * uploaded each year); bringing in one bill of the household's electricity is
 * not enough. Only when nobody is known to have set it up or brought a bill in
 * (set up by hand, or mail straight from the provider) can an admin or its
 * payer. (Whoever is being asked "Who's this for?" may answer either way.)
 * `bills` is who brought each of its bills in (null: nobody known).
 */
export function canChangeOwner(
  me: { id: string; role: string },
  svc: {
    ownerMemberId: string | null;
    payerMemberId: string | null;
    setUpByMemberId?: string | null;
  },
  bills: (string | null)[] = [],
): boolean {
  if (svc.ownerMemberId) return svc.ownerMemberId === me.id;
  if (svc.setUpByMemberId === me.id) return true;
  if (bills.length > 0 && bills.every((m) => m === me.id)) return true;
  if (svc.setUpByMemberId || bills.some((m) => m !== null)) return false;
  return isAdmin(me) || svc.payerMemberId === me.id;
}

/** `canChangeOwner()` for a stored service, working out who brought its bills in. */
export function mayChangeOwner(
  householdId: string,
  me: { id: string; role: string },
  svc: Pick<
    ServiceWithType,
    | 'id'
    | 'ownerMemberId'
    | 'payerMemberId'
    | 'setUpByMemberId'
    | 'ownerAskedAt'
    | 'ownerConfirmedAt'
  >,
  db: Db = getDb(),
): boolean {
  return canChangeOwner(me, svc, billBringers(householdId, svc.id, db)) || asksMember(svc, me);
}

/** Who brought one bill in (uploaded, forwarded from their address, or entered it), if known. */
function billBroughtInBy(householdId: string, billId: string, db: Db): string | null {
  const d = db
    .select({
      createdBy: bill.createdByMemberId,
      memberId: sourceDocument.memberId,
      senderVerified: sourceDocument.senderVerified,
      emailFrom: sourceDocument.emailFrom,
    })
    .from(bill)
    .leftJoin(sourceDocument, eq(sourceDocument.id, bill.sourceDocumentId))
    .where(and(eq(bill.householdId, householdId), eq(bill.id, billId)))
    .get();
  return d ? (actingMember(householdId, d, db) ?? d.createdBy) : null;
}

/**
 * May this member move a bill to that service? Between two services on the
 * same side (the household's, or their own) yes. Out of the household into
 * their own only when they brought that bill in; from their own into the
 * household's always (only they can see it). Never onto someone else's.
 */
export function mayMoveBill(
  householdId: string,
  me: { id: string },
  b: { id: string; ownerMemberId: string | null },
  target: { ownerMemberId: string | null },
  db: Db = getDb(),
): boolean {
  if (!visibleTo(b.ownerMemberId, me.id) || !visibleTo(target.ownerMemberId, me.id)) return false;
  if ((b.ownerMemberId ?? null) === (target.ownerMemberId ?? null)) return true;
  if (b.ownerMemberId === me.id) return true;
  return billBroughtInBy(householdId, b.id, db) === me.id;
}
