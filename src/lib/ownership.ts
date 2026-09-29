import { and, eq, isNotNull, isNull } from 'drizzle-orm';
import { getDb, type Db } from '@/db/client';
import { bill, service, sourceDocument } from '@/db/schema';
import { actingMember } from '@/lib/acting-member';
import { setServiceOwner } from '@/lib/bills';
import { getService, listServices, type ServiceWithType } from '@/lib/services';
import { visibleTo } from '@/lib/scope';

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
  return svc.setUpByMemberId ? svc.setUpByMemberId === me.id : me.role === 'owner';
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
 * The members who brought any of this service's bills in: whoever uploaded a
 * bill's file, or forwarded it from their own address.
 */
export function broughtInBy(householdId: string, serviceId: string, db: Db = getDb()): Set<string> {
  const docs = db
    .select({
      memberId: sourceDocument.memberId,
      senderVerified: sourceDocument.senderVerified,
      emailFrom: sourceDocument.emailFrom,
    })
    .from(bill)
    .innerJoin(sourceDocument, eq(sourceDocument.id, bill.sourceDocumentId))
    .where(and(eq(bill.householdId, householdId), eq(bill.serviceId, serviceId)))
    .all();
  const who = new Set<string>();
  for (const d of docs) {
    const m = actingMember(householdId, d, db);
    if (m) who.add(m);
  }
  return who;
}

/**
 * May this member switch a service between household and personal? Its owner
 * can hand a personal one back. A household one can be made theirs by whoever
 * set it up or brought any of its bills in (upload or forward); only when
 * nobody is known to have (set up by hand, or mail straight from the provider)
 * can an admin or its payer. (Whoever is being asked "Who's this for?" may
 * answer either way.) `broughtIn` is `broughtInBy()` for the service.
 */
export function canChangeOwner(
  me: { id: string; role: string },
  svc: {
    ownerMemberId: string | null;
    payerMemberId: string | null;
    setUpByMemberId?: string | null;
  },
  broughtIn: Set<string> = new Set(),
): boolean {
  if (svc.ownerMemberId) return svc.ownerMemberId === me.id;
  if (svc.setUpByMemberId === me.id || broughtIn.has(me.id)) return true;
  if (svc.setUpByMemberId || broughtIn.size) return false;
  return me.role === 'owner' || svc.payerMemberId === me.id;
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
  return canChangeOwner(me, svc, broughtInBy(householdId, svc.id, db)) || asksMember(svc, me);
}
