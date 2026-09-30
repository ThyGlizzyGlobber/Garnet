import { and, eq, gte, isNotNull } from 'drizzle-orm';
import { getDb, type Db } from '@/db/client';
import { bill, billInstalment, member, service, share, sourceDocument } from '@/db/schema';
import { addDays, dayIn } from '@/lib/dates';
import { getHousehold } from '@/lib/households';
import { listDocuments } from '@/lib/review';
import { ownerCondition, type Scope } from '@/lib/scope';

/**
 * What happened lately (the "Recent activity" widget): a housemate paying
 * their share, a bill (or an instalment) paid to the provider, and documents
 * arriving and being analysed. Newest first. The UI gives each its words.
 */
export type ActivityEvent =
  | {
      kind: 'share_paid';
      date: string;
      memberId: string;
      payerId: string | null;
      amountMinor: number;
      serviceName: string;
      instalment: number | null;
      billId: string;
    }
  | {
      kind: 'bill_paid';
      date: string;
      payerId: string | null;
      amountMinor: number;
      serviceName: string;
      instalment: number | null;
      billId: string;
    }
  | {
      kind: 'document';
      date: string;
      documentId: string;
      title: string;
      /** How it arrived: uploaded, forwarded or emailed in, with the sender's name when known. */
      how: 'upload' | 'forward' | 'email';
      memberName: string | null;
      type: 'pdf' | 'email' | 'photo';
      state: 'analysed' | 'waiting' | 'failed';
      needs: boolean;
      billId: string | null;
    };

export function recentActivity(
  householdId: string,
  today: string,
  days = 16,
  scope: Scope = {},
  db: Db = getDb(),
): ActivityEvent[] {
  const hh = getHousehold(householdId, db);
  const tz = hh?.timezone ?? 'UTC';
  const since = addDays(today, -days);
  const sinceIso = `${since}T00:00:00.000Z`;
  const out: ActivityEvent[] = [];

  const sharesPaid = db
    .select({ share, bill, serviceName: service.name, payer: service.payerMemberId })
    .from(share)
    .innerJoin(bill, eq(share.billId, bill.id))
    .innerJoin(service, eq(bill.serviceId, service.id))
    .where(
      and(
        eq(share.householdId, householdId),
        isNotNull(share.paidAt),
        gte(share.paidAt, sinceIso),
        ownerCondition(bill.ownerMemberId, scope),
      ),
    )
    .all();
  for (const r of sharesPaid) {
    // The payer's own share is settled by paying the provider, not a housemate.
    if (r.share.memberId === r.payer) continue;
    out.push({
      kind: 'share_paid',
      date: dayIn(r.share.paidAt!, tz),
      memberId: r.share.memberId,
      payerId: r.payer,
      amountMinor: r.share.amountMinor,
      serviceName: r.serviceName,
      instalment: r.share.instalment || null,
      billId: r.bill.id,
    });
  }

  const paidBills = db
    .select({ bill, serviceName: service.name, payer: service.payerMemberId })
    .from(bill)
    .innerJoin(service, eq(bill.serviceId, service.id))
    .where(
      and(
        eq(bill.householdId, householdId),
        isNotNull(bill.paidToProviderAt),
        gte(bill.paidToProviderAt, sinceIso),
        ownerCondition(bill.ownerMemberId, scope),
      ),
    )
    .all();
  for (const r of paidBills)
    out.push({
      kind: 'bill_paid',
      date: dayIn(r.bill.paidToProviderAt!, tz),
      payerId: r.payer,
      amountMinor: r.bill.amountMinor,
      serviceName: r.serviceName,
      instalment: null,
      billId: r.bill.id,
    });

  const paidInstalments = db
    .select({ i: billInstalment, bill, serviceName: service.name, payer: service.payerMemberId })
    .from(billInstalment)
    .innerJoin(bill, eq(billInstalment.billId, bill.id))
    .innerJoin(service, eq(bill.serviceId, service.id))
    .where(
      and(
        eq(bill.householdId, householdId),
        isNotNull(billInstalment.paidToProviderAt),
        gte(billInstalment.paidToProviderAt, sinceIso),
        eq(bill.paymentPlan, 'instalments'),
        ownerCondition(bill.ownerMemberId, scope),
      ),
    )
    .all();
  for (const r of paidInstalments)
    out.push({
      kind: 'bill_paid',
      date: dayIn(r.i.paidToProviderAt!, tz),
      payerId: r.payer,
      amountMinor: r.i.amountMinor,
      serviceName: r.serviceName,
      instalment: r.i.seq,
      billId: r.bill.id,
    });

  const names = new Map(
    db
      .select({ id: member.id, name: member.name })
      .from(member)
      .where(eq(member.householdId, householdId))
      .all()
      .map((m) => [m.id, m.name]),
  );
  for (const d of listDocuments(householdId, scope, db)) {
    if (d.arrived < since || d.status === 'ignored') continue;
    const row = db
      .select({ memberId: sourceDocument.memberId, kind: sourceDocument.kind })
      .from(sourceDocument)
      .where(eq(sourceDocument.id, d.id))
      .get();
    // Waiting: not read yet. Failed: read, but nothing could be made of it. Otherwise analysed.
    const state =
      d.status === 'unprocessed'
        ? 'waiting'
        : d.status === 'needs_review' && !d.extraction?.result
          ? 'failed'
          : 'analysed';
    out.push({
      kind: 'document',
      date: d.arrived,
      documentId: d.id,
      title: d.emailSubject ?? d.originalFilename ?? d.id,
      how: row?.kind === 'upload' ? 'upload' : row?.memberId ? 'forward' : 'email',
      memberName: row?.memberId ? (names.get(row.memberId) ?? null) : null,
      type:
        row?.kind === 'email'
          ? 'email'
          : /\.(jpe?g|png|heic|webp)$/i.test(d.originalFilename ?? '')
            ? 'photo'
            : 'pdf',
      state,
      needs: d.status === 'needs_review' && !!d.extraction?.result,
      billId: d.linkedBillId,
    });
  }

  return out.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}
