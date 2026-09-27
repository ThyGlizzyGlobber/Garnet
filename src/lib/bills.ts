import { and, desc, eq, inArray } from 'drizzle-orm';
import { getDb, type Db } from '@/db/client';
import {
  bill,
  member,
  service,
  share,
  type Bill,
  type BillSource,
  type Member,
  type Share,
} from '@/db/schema';
import { ulid } from '@/lib/ids';
import { getHousehold } from '@/lib/households';
import { listMembers } from '@/lib/members';
import { getCustomSplits, getService, type ServiceWithType } from '@/lib/services';
import { computeShares, renderPaymentReference } from '@/lib/splits';
import { anomalyNote, detectAnomaly } from '@/lib/anomaly';

export interface BillInput {
  serviceId: string;
  amountMinor: number;
  currency?: string;
  taxMinor?: number | null;
  taxLabel?: string | null;
  periodStart: string;
  periodEnd: string;
  issueDate?: string | null;
  dueDate: string;
  usageQuantity?: number | null;
  usageUnit?: string | null;
  source: BillSource;
  extractor?: string | null;
  confidence?: number | null;
  externalRef?: string | null;
  sourceDocumentId?: string | null;
  paidToProviderAt?: string | null;
  notes?: string | null;
  createdByMemberId?: string | null;
}

export type ShareWithMember = Share & { member: Member };
export type BillDetail = Bill & { service: ServiceWithType; shares: ShareWithMember[] };
export type BillListItem = Bill & {
  service: ServiceWithType;
  shareCount: number;
  paidShareCount: number;
};

/** Short period label for payment references, e.g. "Jul26". */
function periodLabel(periodStart: string, locale: string): string {
  const d = new Date(`${periodStart}T00:00:00Z`);
  const month = new Intl.DateTimeFormat(locale, { month: 'short', timeZone: 'UTC' })
    .format(d)
    .replace(/\./g, '');
  // Some locales spell short months in full ("June" in en-AU); keep references compact.
  return `${month.slice(0, 3)}${periodStart.slice(2, 4)}`;
}

/**
 * Insert a bill and, when the household is in shared mode, its member shares.
 * Everything happens in one transaction so a bill never exists without its shares.
 */
export function createBill(householdId: string, input: BillInput, db: Db = getDb()): BillDetail {
  const hh = getHousehold(householdId, db);
  if (!hh) throw new Error('Household not found');
  const svc = getService(householdId, input.serviceId, db);
  if (!svc) throw new Error('Service not found');
  if (input.periodEnd < input.periodStart)
    throw new Error('Billing period end is before its start');
  if (!Number.isInteger(input.amountMinor) || input.amountMinor < 0)
    throw new Error('Amount must be a non-negative integer');
  if (input.externalRef) {
    const dup = db
      .select({ id: bill.id })
      .from(bill)
      .where(and(eq(bill.serviceId, input.serviceId), eq(bill.externalRef, input.externalRef)))
      .get();
    if (dup)
      throw new Error(`A bill with reference ${input.externalRef} already exists for this service`);
  }

  const now = new Date().toISOString();
  const id = ulid();
  const currency = input.currency ?? hh.currency;
  const anomaly = anomalyFor(householdId, input.serviceId, input, null, db);

  db.transaction((tx) => {
    tx.insert(bill)
      .values({
        id,
        householdId,
        isAnomaly: anomaly.isAnomaly,
        anomalyNote: anomaly.note,
        serviceId: input.serviceId,
        sourceDocumentId: input.sourceDocumentId ?? null,
        amountMinor: input.amountMinor,
        currency,
        taxMinor: input.taxMinor ?? null,
        taxLabel: input.taxLabel ?? null,
        periodStart: input.periodStart,
        periodEnd: input.periodEnd,
        issueDate: input.issueDate ?? null,
        dueDate: input.dueDate,
        usageQuantity: input.usageQuantity ?? null,
        usageUnit: input.usageUnit ?? svc.usageUnit ?? null,
        source: input.source,
        extractor: input.extractor ?? null,
        confidence: input.confidence ?? null,
        externalRef: input.externalRef ?? null,
        paidToProviderAt: input.paidToProviderAt ?? null,
        notes: input.notes ?? null,
        createdByMemberId: input.createdByMemberId ?? null,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    if (hh.splitMode === 'shared')
      insertShares(
        tx,
        householdId,
        id,
        svc,
        { ...input, currency },
        hh.paymentReferenceTemplate,
        hh.locale,
        now,
      );
  });

  return getBill(householdId, id, db)!;
}

function insertShares(
  tx: Db,
  householdId: string,
  billId: string,
  svc: ServiceWithType,
  input: BillInput & { currency: string },
  template: string,
  locale: string,
  now: string,
) {
  const members = listMembers(householdId, tx);
  const results = computeShares({
    amountMinor: input.amountMinor,
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    splitMode: svc.splitMode,
    members,
    customWeights:
      svc.splitMode === 'custom' ? getCustomSplits(householdId, svc.id, tx) : undefined,
    payerMemberId: svc.payerMemberId,
  });
  if (!results.length) return;
  const byId = new Map(members.map((m) => [m.id, m]));
  tx.insert(share)
    .values(
      results.map((r) => ({
        id: ulid(),
        householdId,
        billId,
        memberId: r.memberId,
        amountMinor: r.amountMinor,
        currency: input.currency,
        basisWeight: r.basisWeight,
        basisDays: r.basisDays,
        periodDays: r.periodDays,
        paidAt: r.isPayer ? now : null,
        paidMethod: r.isPayer ? 'payer' : null,
        paymentReference: renderPaymentReference(template, {
          service: svc.name,
          period: periodLabel(input.periodStart, locale),
          member: byId.get(r.memberId)?.name ?? '',
          ref: input.externalRef,
        }),
        markedByMemberId: null,
        createdAt: now,
        updatedAt: now,
      })),
    )
    .run();
}

/** Compare against earlier bills of the same service (by period start). */
function anomalyFor(
  householdId: string,
  serviceId: string,
  b: { amountMinor: number; periodStart: string; periodEnd: string },
  excludeId: string | null,
  db: Db,
): { isAnomaly: boolean; note: string | null } {
  const priors = db
    .select({
      id: bill.id,
      amountMinor: bill.amountMinor,
      periodStart: bill.periodStart,
      periodEnd: bill.periodEnd,
    })
    .from(bill)
    .where(and(eq(bill.householdId, householdId), eq(bill.serviceId, serviceId)))
    .all()
    .filter((p) => p.id !== excludeId && p.periodStart < b.periodStart);
  const r = detectAnomaly(b, priors);
  return {
    isAnomaly: r.isAnomaly,
    note: r.isAnomaly && r.ratio !== null ? anomalyNote(r.ratio) : null,
  };
}

export function getBill(householdId: string, id: string, db: Db = getDb()): BillDetail | null {
  const b = db
    .select()
    .from(bill)
    .where(and(eq(bill.householdId, householdId), eq(bill.id, id)))
    .get();
  if (!b) return null;
  const svc = getService(householdId, b.serviceId, db)!;
  const shares = db
    .select()
    .from(share)
    .innerJoin(member, eq(share.memberId, member.id))
    .where(eq(share.billId, id))
    .all()
    .map((r) => ({ ...r.share, member: r.member }));
  return { ...b, service: svc, shares };
}

export function listBills(
  householdId: string,
  opts: { serviceId?: string; limit?: number } = {},
  db: Db = getDb(),
): BillListItem[] {
  let q = db
    .select()
    .from(bill)
    .innerJoin(service, eq(bill.serviceId, service.id))
    .where(
      and(
        eq(bill.householdId, householdId),
        opts.serviceId ? eq(bill.serviceId, opts.serviceId) : undefined,
      ),
    )
    .orderBy(desc(bill.periodStart), desc(bill.createdAt))
    .$dynamic();
  if (opts.limit) q = q.limit(opts.limit);
  const rows = q.all();
  if (!rows.length) return [];
  const ids = rows.map((r) => r.bill.id);
  const shares = db.select().from(share).where(inArray(share.billId, ids)).all();
  const services = new Map<string, ServiceWithType>();
  return rows.map((r) => {
    let svc = services.get(r.service.id);
    if (!svc) {
      svc = getService(householdId, r.service.id, db)!;
      services.set(svc.id, svc);
    }
    const mine = shares.filter((s) => s.billId === r.bill.id);
    return {
      ...r.bill,
      service: svc,
      shareCount: mine.length,
      paidShareCount: mine.filter((s) => s.paidAt).length,
    };
  });
}

/** Update bill fields. Shares are recomputed unless any non-payer share is already paid. */
export function updateBill(
  householdId: string,
  id: string,
  patch: Partial<BillInput>,
  db: Db = getDb(),
): BillDetail {
  const existing = getBill(householdId, id, db);
  if (!existing) throw new Error('Bill not found');
  if (patch.serviceId && !getService(householdId, patch.serviceId, db))
    throw new Error('Service not found');
  const hh = getHousehold(householdId, db)!;
  const merged: BillInput = { ...existing, ...patch, source: existing.source };
  if (merged.periodEnd < merged.periodStart)
    throw new Error('Billing period end is before its start');
  const locked = existing.shares.some((s) => s.paidAt && s.paidMethod !== 'payer');
  const affectsShares =
    patch.amountMinor !== undefined ||
    patch.periodStart !== undefined ||
    patch.periodEnd !== undefined ||
    (patch.serviceId !== undefined && patch.serviceId !== existing.serviceId);
  if (locked && affectsShares)
    throw new Error('Shares have been paid; amount and period are locked');
  const now = new Date().toISOString();
  const anomaly = affectsShares ? anomalyFor(householdId, merged.serviceId, merged, id, db) : null;
  db.transaction((tx) => {
    tx.update(bill)
      .set({
        ...patch,
        ...(anomaly ? { isAnomaly: anomaly.isAnomaly, anomalyNote: anomaly.note } : {}),
        updatedAt: now,
      })
      .where(and(eq(bill.householdId, householdId), eq(bill.id, id)))
      .run();
    if (affectsShares && hh.splitMode === 'shared') {
      tx.delete(share)
        .where(and(eq(share.householdId, householdId), eq(share.billId, id)))
        .run();
      const svc = getService(householdId, merged.serviceId, tx)!;
      insertShares(
        tx,
        householdId,
        id,
        svc,
        { ...merged, currency: merged.currency ?? hh.currency },
        hh.paymentReferenceTemplate,
        hh.locale,
        now,
      );
    }
  });
  return getBill(householdId, id, db)!;
}

export function deleteBill(householdId: string, id: string, db: Db = getDb()): void {
  db.delete(bill)
    .where(and(eq(bill.householdId, householdId), eq(bill.id, id)))
    .run(); // shares cascade
}

export function setSharePaid(
  householdId: string,
  shareId: string,
  paid: boolean,
  opts: { method?: string; markedByMemberId?: string | null } = {},
  db: Db = getDb(),
): Share {
  const now = new Date().toISOString();
  db.update(share)
    .set(
      paid
        ? {
            paidAt: now,
            paidMethod: opts.method ?? 'transfer',
            markedByMemberId: opts.markedByMemberId ?? null,
            updatedAt: now,
          }
        : {
            paidAt: null,
            paidMethod: null,
            markedByMemberId: opts.markedByMemberId ?? null,
            updatedAt: now,
          },
    )
    .where(and(eq(share.householdId, householdId), eq(share.id, shareId)))
    .run();
  const row = db
    .select()
    .from(share)
    .where(and(eq(share.householdId, householdId), eq(share.id, shareId)))
    .get();
  if (!row) throw new Error('Share not found');
  return row;
}

export function setBillPaidToProvider(
  householdId: string,
  id: string,
  paid: boolean,
  db: Db = getDb(),
): void {
  const now = new Date().toISOString();
  db.update(bill)
    .set({ paidToProviderAt: paid ? now : null, updatedAt: now })
    .where(and(eq(bill.householdId, householdId), eq(bill.id, id)))
    .run();
}

export type BillAlertKind = 'payment_failed' | 'overdue';

/** Flag a bill from a provider notice. A failed payment also un-marks it as paid to the provider. */
export function setBillAlert(
  householdId: string,
  billId: string,
  kind: BillAlertKind,
  documentId: string | null,
  db: Db = getDb(),
): void {
  const now = new Date().toISOString();
  db.update(bill)
    .set({
      alertKind: kind,
      alertAt: now,
      alertDocumentId: documentId,
      ...(kind === 'payment_failed' ? { paidToProviderAt: null } : {}),
      updatedAt: now,
    })
    .where(and(eq(bill.householdId, householdId), eq(bill.id, billId)))
    .run();
}

export function clearBillAlert(householdId: string, billId: string, db: Db = getDb()): void {
  db.update(bill)
    .set({
      alertKind: null,
      alertAt: null,
      alertDocumentId: null,
      updatedAt: new Date().toISOString(),
    })
    .where(and(eq(bill.householdId, householdId), eq(bill.id, billId)))
    .run();
}

/**
 * The bill a provider notice is about: the most recent one already due (or due
 * within a fortnight); for "payment received", the most recent one not yet paid
 * to the provider.
 */
export function billForNotice(
  householdId: string,
  serviceId: string,
  kind: BillAlertKind | 'payment_received',
  today: string,
  db: Db = getDb(),
): Bill | null {
  const bills = db
    .select()
    .from(bill)
    .where(and(eq(bill.householdId, householdId), eq(bill.serviceId, serviceId)))
    .orderBy(desc(bill.dueDate))
    .all();
  if (kind === 'payment_received') return bills.find((b) => !b.paidToProviderAt) ?? null;
  const horizon = new Date(Date.parse(`${today}T00:00:00Z`) + 14 * 86_400_000)
    .toISOString()
    .slice(0, 10);
  return bills.find((b) => b.dueDate <= horizon) ?? bills[bills.length - 1] ?? null;
}

/** Bills with an unresolved provider alert, newest first. */
export function billsWithAlerts(householdId: string, db: Db = getDb()): BillListItem[] {
  return listBills(householdId, {}, db).filter((b) => b.alertKind);
}
