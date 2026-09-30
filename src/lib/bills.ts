import { and, asc, desc, eq, inArray, isNull } from 'drizzle-orm';
import { getDb, type Db } from '@/db/client';
import {
  asset,
  bill,
  billInstalment,
  member,
  service,
  serviceType,
  share,
  type Bill,
  type BillInstalment,
  type BillSource,
  type Asset,
  type Member,
  type Share,
} from '@/db/schema';
import type { BillInstalmentOption } from '@/ingest/extractors/types';
import { fullPaymentOpen, instalmentDueDate, planLock } from '@/lib/instalments';
import { ownerCondition, type Scope } from '@/lib/scope';
import { addDays, daysInclusive, todayIn, toUtcMs } from '@/lib/dates';
import { ulid } from '@/lib/ids';
import { getHousehold } from '@/lib/households';
import { listMembers } from '@/lib/members';
import { getService, splitSettings, type ServiceWithType } from '@/lib/services';
import { computeShares, renderPaymentReference } from '@/lib/splits';
import { anomalyNote, detectAnomaly } from '@/lib/anomaly';
import { assetKindOf } from '@/lib/service-categories';

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
  /** The instalments the bill offers (amount and due date are then the pay-in-full option). */
  instalments?: BillInstalmentOption[] | null;
  /** Recorded by the app for a recurring service, no bill in yet (src/lib/recurring.ts). */
  assumed?: boolean;
  /** The vehicle or policy it's for (src/lib/assets.ts); dropped if it doesn't fit the service. */
  assetId?: string | null;
  /** Identifiers printed on it (plates, policy numbers), as matching keys. */
  assetRefs?: string[] | null;
}

type ShareWithMember = Share & { member: Member };
export type BillDetail = Bill & {
  service: ServiceWithType;
  shares: ShareWithMember[];
  /** The instalments the bill offers, in order; empty when it offers none. */
  instalments: BillInstalment[];
  /** The vehicle or policy it's filed under. */
  asset: Asset | null;
};
export type BillListItem = Bill & {
  service: ServiceWithType;
  asset: Asset | null;
  shareCount: number;
  paidShareCount: number;
  /** Share counts per instalment (0 = the whole bill). */
  sharesByInstalment: Record<number, { count: number; paid: number }>;
  /** Each share's member, instalment (0 = the whole bill), amount and payment. */
  shares: Pick<Share, 'id' | 'memberId' | 'instalment' | 'amountMinor' | 'paidAt' | 'paidMethod'>[];
  instalments: BillInstalment[];
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
  // The real bill for a charge the app assumed (a recurring subscription)
  // takes the assumed bill's place, with its own price and details.
  const offersInstalments = !!input.instalments && input.instalments.length >= 2;
  if (!input.assumed && !offersInstalments) {
    const assumed = assumedBillFor(householdId, input, db);
    if (assumed) return takeAssumedPlace(householdId, assumed, input, db);
  }
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
  const options = input.instalments && input.instalments.length >= 2 ? input.instalments : null;

  db.transaction((tx) => {
    tx.insert(bill)
      .values({
        id,
        householdId,
        serviceId: input.serviceId,
        ownerMemberId: svc.ownerMemberId,
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
        fullAmountMinor: options ? input.amountMinor : null,
        fullDueDate: options ? input.dueDate : null,
        assumed: input.assumed ?? false,
        assetId: input.assetId ?? null,
        assetRefs: input.assetRefs?.length ? input.assetRefs : null,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    if (options)
      tx.insert(billInstalment)
        .values(
          options.map((o, i) => ({
            id: ulid(),
            householdId,
            billId: id,
            seq: i + 1,
            dueDate: o.dueDate,
            amountMinor: o.amountMinor,
          })),
        )
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

  if (input.assetId) unlinkMismatchedAssets(householdId, [id], db);
  refreshAnomalies(householdId, input.serviceId, db);
  return getBill(householdId, id, db)!;
}

/**
 * An assumed charge of the same service that a new bill is the real one for:
 * due within ten days of it, or covering most of the same period.
 */
function assumedBillFor(householdId: string, input: BillInput, db: Db): Bill | null {
  const candidates = db
    .select()
    .from(bill)
    .where(
      and(
        eq(bill.householdId, householdId),
        eq(bill.serviceId, input.serviceId),
        eq(bill.assumed, true),
      ),
    )
    .all();
  const days = (a: string, b: string) => Math.abs(toUtcMs(a) - toUtcMs(b)) / 86_400_000;
  const overlap = (b: Bill) => {
    const s = b.periodStart > input.periodStart ? b.periodStart : input.periodStart;
    const e = b.periodEnd < input.periodEnd ? b.periodEnd : input.periodEnd;
    return e < s ? 0 : daysInclusive(s, e);
  };
  const shorter = (b: Bill) =>
    Math.min(
      daysInclusive(b.periodStart, b.periodEnd),
      daysInclusive(input.periodStart, input.periodEnd),
    );
  return (
    candidates
      .filter((b) => days(b.dueDate, input.dueDate) <= 10 || overlap(b) * 2 >= shorter(b))
      .sort((a, b) => days(a.dueDate, input.dueDate) - days(b.dueDate, input.dueDate))[0] ?? null
  );
}

/**
 * The real bill arrived for an assumed charge: the assumed bill becomes it
 * (amount, dates, invoice, document…), keeping its id. Split again when the
 * price or period changed; a housemate who had already paid their share of
 * the assumed charge stays paid (the difference, a price rise's few cents
 * or dollars, isn't asked of them again).
 */
function takeAssumedPlace(
  householdId: string,
  assumed: Bill,
  input: BillInput,
  db: Db,
): BillDetail {
  const hh = getHousehold(householdId, db)!;
  const svc = getService(householdId, input.serviceId, db)!;
  if (input.externalRef) {
    const dup = db
      .select({ id: bill.id })
      .from(bill)
      .where(and(eq(bill.serviceId, input.serviceId), eq(bill.externalRef, input.externalRef)))
      .get();
    if (dup && dup.id !== assumed.id)
      throw new Error(`A bill with reference ${input.externalRef} already exists for this service`);
  }
  const currency = input.currency ?? hh.currency;
  const now = new Date().toISOString();
  const resplit =
    input.amountMinor !== assumed.amountMinor ||
    input.periodStart !== assumed.periodStart ||
    input.periodEnd !== assumed.periodEnd;
  db.transaction((tx) => {
    tx.update(bill)
      .set({
        sourceDocumentId: input.sourceDocumentId ?? assumed.sourceDocumentId,
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
        paidToProviderAt: input.paidToProviderAt ?? assumed.paidToProviderAt,
        notes: input.notes ?? assumed.notes,
        createdByMemberId: input.createdByMemberId ?? assumed.createdByMemberId,
        assetRefs: input.assetRefs?.length ? input.assetRefs : assumed.assetRefs,
        assumed: false,
        updatedAt: now,
      })
      .where(eq(bill.id, assumed.id))
      .run();
    if (!resplit || hh.splitMode !== 'shared') return;
    const before = tx.select().from(share).where(eq(share.billId, assumed.id)).all();
    tx.delete(share).where(eq(share.billId, assumed.id)).run();
    insertShares(
      tx,
      householdId,
      assumed.id,
      svc,
      { ...input, currency },
      hh.paymentReferenceTemplate,
      hh.locale,
      now,
    );
    for (const was of before.filter((x) => x.paidAt && x.paidMethod !== 'payer'))
      tx.update(share)
        .set({
          paidAt: was.paidAt,
          paidMethod: was.paidMethod,
          markedByMemberId: was.markedByMemberId,
        })
        .where(
          and(
            eq(share.billId, assumed.id),
            eq(share.memberId, was.memberId),
            eq(share.instalment, was.instalment),
          ),
        )
        .run();
  });
  refreshAnomalies(householdId, input.serviceId, db);
  return getBill(householdId, assumed.id, db)!;
}

/**
 * A bill's member shares. Paid by instalments, each instalment is split the
 * same way as the whole bill would be, with the instalment's due date, and its
 * payment reference names the instalment's month.
 */
function insertShares(
  tx: Db,
  householdId: string,
  billId: string,
  svc: ServiceWithType,
  input: BillInput & { currency: string },
  template: string,
  locale: string,
  now: string,
  instalments: Pick<BillInstalment, 'seq' | 'dueDate' | 'amountMinor'>[] = [],
) {
  // A personal service's bills belong to its owner alone: nothing to split.
  if (svc.ownerMemberId) return;
  const members = listMembers(householdId, tx);
  const byId = new Map(members.map((m) => [m.id, m]));
  const settings = splitSettings(householdId, svc, tx);
  const parts = instalments.length
    ? instalments.map((i) => ({
        instalment: i.seq,
        dueDate: i.dueDate,
        amountMinor: i.amountMinor,
      }))
    : [{ instalment: 0, dueDate: null, amountMinor: input.amountMinor }];
  const rows = parts.flatMap((part) =>
    computeShares({
      amountMinor: part.amountMinor,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      splitMode: svc.splitMode,
      members,
      ...settings,
      // Set amounts are per bill: an instalment pays its part of each.
      referenceAmountMinor: input.amountMinor,
      payerMemberId: svc.payerMemberId,
    }).map((r) => ({
      id: ulid(),
      householdId,
      billId,
      memberId: r.memberId,
      instalment: part.instalment,
      dueDate: part.dueDate,
      amountMinor: r.amountMinor,
      currency: input.currency,
      basisWeight: r.basisWeight,
      basisDays: r.basisDays,
      periodDays: r.periodDays,
      paidAt: r.isPayer ? now : null,
      paidMethod: r.isPayer ? 'payer' : null,
      paymentReference: renderPaymentReference(template, {
        service: svc.name,
        period: periodLabel(part.dueDate ?? input.periodStart, locale),
        member: byId.get(r.memberId)?.name ?? '',
        ref: input.externalRef,
      }),
      markedByMemberId: null,
      createdAt: now,
      updatedAt: now,
    })),
  );
  if (rows.length) tx.insert(share).values(rows).run();
}

function listInstalments(billIds: string[], db: Db): BillInstalment[] {
  if (!billIds.length) return [];
  return db
    .select()
    .from(billInstalment)
    .where(inArray(billInstalment.billId, billIds))
    .orderBy(asc(billInstalment.seq))
    .all();
}

/**
 * Recalculate the Unusual flag for every bill of a service. Runs whenever a
 * service's bills change, so bills arriving out of order (a year of history
 * forwarded at once, oldest last) still end up compared with the right ones.
 */
export function refreshAnomalies(householdId: string, serviceId: string, db: Db = getDb()): number {
  const svc = getService(householdId, serviceId, db);
  if (!svc) return 0;
  const rows = db
    .select({
      id: bill.id,
      amountMinor: bill.amountMinor,
      periodStart: bill.periodStart,
      periodEnd: bill.periodEnd,
      isAnomaly: bill.isAnomaly,
      anomalyNote: bill.anomalyNote,
      anomalyBasis: bill.anomalyBasis,
    })
    .from(bill)
    .where(and(eq(bill.householdId, householdId), eq(bill.serviceId, serviceId)))
    .all();
  let changed = 0;
  for (const b of rows) {
    const r = detectAnomaly(
      b,
      rows.filter((p) => p.id !== b.id),
      { seasonal: svc.seasonal },
    );
    const note = r.isAnomaly && r.ratio !== null ? anomalyNote(r.ratio, r.basis ?? 'recent') : null;
    if (b.isAnomaly === r.isAnomaly && b.anomalyNote === note && b.anomalyBasis === r.basis)
      continue;
    db.update(bill)
      .set({ isAnomaly: r.isAnomaly, anomalyNote: note, anomalyBasis: r.basis })
      .where(eq(bill.id, b.id))
      .run();
    changed++;
  }
  return changed;
}

/** Bump when the Unusual rule changes, so existing bills are re-checked once at startup. */
export const ANOMALY_RULE_VERSION = 2;

/** Recalculate every bill's Unusual flag (after the rule changes). */
export function refreshAllAnomalies(db: Db = getDb()): number {
  const pairs = db
    .selectDistinct({ householdId: bill.householdId, serviceId: bill.serviceId })
    .from(bill)
    .all();
  return pairs.reduce((n, p) => n + refreshAnomalies(p.householdId, p.serviceId, db), 0);
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
    .orderBy(asc(share.instalment))
    .all()
    .map((r) => ({ ...r.share, member: r.member }));
  const a = b.assetId
    ? (db.select().from(asset).where(eq(asset.id, b.assetId)).get() ?? null)
    : null;
  return { ...b, service: svc, shares, instalments: listInstalments([id], db), asset: a };
}

/** A household's bills, newest first. Household bills only unless the scope says otherwise. */
export function listBills(
  householdId: string,
  opts: { serviceId?: string; limit?: number } & Scope = {},
  db: Db = getDb(),
): BillListItem[] {
  let q = db
    .select()
    .from(bill)
    .innerJoin(service, eq(bill.serviceId, service.id))
    .leftJoin(asset, eq(bill.assetId, asset.id))
    .where(
      and(
        eq(bill.householdId, householdId),
        opts.serviceId ? eq(bill.serviceId, opts.serviceId) : undefined,
        // One service's bills: the caller already chose a service it may see.
        opts.serviceId && !opts.viewer && !opts.owner
          ? undefined
          : ownerCondition(bill.ownerMemberId, opts),
      ),
    )
    .orderBy(desc(bill.periodStart), desc(bill.createdAt))
    .$dynamic();
  if (opts.limit) q = q.limit(opts.limit);
  const rows = q.all();
  if (!rows.length) return [];
  const ids = rows.map((r) => r.bill.id);
  const shares = db.select().from(share).where(inArray(share.billId, ids)).all();
  const instalments = listInstalments(ids, db);
  const services = new Map<string, ServiceWithType>();
  return rows.map((r) => {
    let svc = services.get(r.service.id);
    if (!svc) {
      svc = getService(householdId, r.service.id, db)!;
      services.set(svc.id, svc);
    }
    const mine = shares.filter((s) => s.billId === r.bill.id);
    const sharesByInstalment: BillListItem['sharesByInstalment'] = {};
    for (const s of mine) {
      const c = (sharesByInstalment[s.instalment] ??= { count: 0, paid: 0 });
      c.count++;
      if (s.paidAt) c.paid++;
    }
    return {
      ...r.bill,
      service: svc,
      asset: r.asset,
      shareCount: mine.length,
      paidShareCount: mine.filter((s) => s.paidAt).length,
      sharesByInstalment,
      shares: mine.map((s) => ({
        id: s.id,
        memberId: s.memberId,
        instalment: s.instalment,
        amountMinor: s.amountMinor,
        paidAt: s.paidAt,
        paidMethod: s.paidMethod,
      })),
      instalments: instalments.filter((i) => i.billId === r.bill.id),
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
  const byInstalments = existing.paymentPlan === 'instalments' && existing.instalments.length > 0;
  if (byInstalments) {
    // Amount, due date and "paid to the provider" follow the instalments.
    if (
      (patch.amountMinor !== undefined && patch.amountMinor !== existing.amountMinor) ||
      (patch.dueDate !== undefined && patch.dueDate !== existing.dueDate)
    )
      throw new Error(
        'This bill is paid by instalments: its amount and due date come from them. Switch it to paying in full to change them.',
      );
    patch = { ...patch };
    delete patch.paidToProviderAt;
  }
  const merged: BillInput = { ...existing, ...patch, source: existing.source };
  if (merged.periodEnd < merged.periodStart)
    throw new Error('Billing period end is before its start');
  const locked = existing.shares.some((s) => s.paidAt && s.paidMethod !== 'payer');
  // Only a real change counts: the edit form sends every field, changed or not.
  const affectsShares =
    (patch.amountMinor !== undefined && patch.amountMinor !== existing.amountMinor) ||
    (patch.periodStart !== undefined && patch.periodStart !== existing.periodStart) ||
    (patch.periodEnd !== undefined && patch.periodEnd !== existing.periodEnd) ||
    (patch.serviceId !== undefined && patch.serviceId !== existing.serviceId);
  if (locked && affectsShares)
    throw new Error('Shares have been paid; amount and period are locked');
  const now = new Date().toISOString();
  db.transaction((tx) => {
    const fields = { ...patch };
    delete fields.instalments;
    const newService =
      patch.serviceId && patch.serviceId !== existing.serviceId
        ? getService(householdId, patch.serviceId, tx)
        : null;
    tx.update(bill)
      .set({
        ...fields,
        // Paying in full: the pay-in-full option is what the bill says now.
        ...(existing.instalments.length && !byInstalments
          ? { fullAmountMinor: merged.amountMinor, fullDueDate: merged.dueDate }
          : {}),
        // Moved to another service: household or personal with it.
        ...(newService ? { ownerMemberId: newService.ownerMemberId } : {}),
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
        byInstalments ? existing.instalments : [],
      );
    }
  });
  if (affectsShares) {
    refreshAnomalies(householdId, merged.serviceId, db);
    if (merged.serviceId !== existing.serviceId)
      refreshAnomalies(householdId, existing.serviceId, db);
  }
  unlinkMismatchedAssets(householdId, [id], db);
  return getBill(householdId, id, db)!;
}

/**
 * Move a bill to another service or sub-service (a Netflix bill filed under
 * Spotify). It takes the new service's owner: household or someone's own.
 * Split again by the new service's rules, unless a housemate has already paid
 * a share: then its shares stay as they are, and it can only move between
 * household services. The caller checks who may move it (mayMoveBill).
 */
export function moveBill(
  householdId: string,
  id: string,
  toServiceId: string,
  db: Db = getDb(),
): BillDetail {
  const existing = getBill(householdId, id, db);
  if (!existing) throw new Error('Bill not found');
  if (existing.serviceId === toServiceId) return existing;
  const target = getService(householdId, toServiceId, db);
  if (!target) throw new Error('Service not found');
  const hh = getHousehold(householdId, db)!;
  if (existing.externalRef) {
    const dup = db
      .select({ id: bill.id })
      .from(bill)
      .where(and(eq(bill.serviceId, toServiceId), eq(bill.externalRef, existing.externalRef)))
      .get();
    if (dup)
      throw new Error(
        `A bill with reference ${existing.externalRef} already exists for that service`,
      );
  }
  const locked = existing.shares.some((s) => s.paidAt && s.paidMethod !== 'payer');
  const sameSide = (existing.ownerMemberId ?? null) === (target.ownerMemberId ?? null);
  if (locked && !sameSide)
    throw new Error('Housemates have paid shares of this bill, so it stays with the household');
  const now = new Date().toISOString();
  db.transaction((tx) => {
    tx.update(bill)
      .set({ serviceId: toServiceId, ownerMemberId: target.ownerMemberId, updatedAt: now })
      .where(and(eq(bill.householdId, householdId), eq(bill.id, id)))
      .run();
    if (locked) return;
    tx.delete(share)
      .where(and(eq(share.householdId, householdId), eq(share.billId, id)))
      .run();
    if (hh.splitMode !== 'shared') return;
    insertShares(
      tx,
      householdId,
      id,
      target,
      { ...existing, currency: existing.currency },
      hh.paymentReferenceTemplate,
      hh.locale,
      now,
      existing.paymentPlan === 'instalments' ? existing.instalments : [],
    );
  });
  // Moved to a service of another kind, or to someone else's side: its
  // vehicle or policy no longer fits.
  unlinkMismatchedAssets(householdId, [id], db);
  refreshAnomalies(householdId, existing.serviceId, db);
  refreshAnomalies(householdId, toServiceId, db);
  return getBill(householdId, id, db)!;
}

/**
 * A bill filed under a vehicle or policy stays with it only while it fits:
 * its service is of the vehicle's (or policy's) category, and it's on the
 * same side, the household's or the same member's own. Bills that no longer
 * fit (moved, or their service switched between household and personal)
 * lose it and wait under "No vehicle yet". Returns how many.
 */
function unlinkMismatchedAssets(
  householdId: string,
  billIds: string[] | null = null,
  db: Db = getDb(),
): number {
  if (billIds && !billIds.length) return 0;
  const rows = db
    .select({
      id: bill.id,
      owner: bill.ownerMemberId,
      assetOwner: asset.ownerMemberId,
      kind: asset.kind,
      category: serviceType.category,
    })
    .from(bill)
    .innerJoin(asset, eq(bill.assetId, asset.id))
    .innerJoin(service, eq(bill.serviceId, service.id))
    .innerJoin(serviceType, eq(service.typeSlug, serviceType.slug))
    .where(and(eq(bill.householdId, householdId), billIds ? inArray(bill.id, billIds) : undefined))
    .all();
  const loose = rows
    .filter(
      (r) => (r.owner ?? null) !== (r.assetOwner ?? null) || assetKindOf(r.category) !== r.kind,
    )
    .map((r) => r.id);
  if (loose.length)
    db.update(bill)
      .set({ assetId: null, updatedAt: new Date().toISOString() })
      .where(inArray(bill.id, loose))
      .run();
  return loose.length;
}

export function deleteBill(householdId: string, id: string, db: Db = getDb()): void {
  const row = db
    .select({ serviceId: bill.serviceId })
    .from(bill)
    .where(and(eq(bill.householdId, householdId), eq(bill.id, id)))
    .get();
  db.delete(bill)
    .where(and(eq(bill.householdId, householdId), eq(bill.id, id)))
    .run(); // shares cascade
  if (row) refreshAnomalies(householdId, row.serviceId, db);
}

export function setSharePaid(
  householdId: string,
  shareId: string,
  paid: boolean,
  opts: { method?: string; markedByMemberId?: string | null; paidAt?: string } = {},
  db: Db = getDb(),
): Share {
  const now = new Date().toISOString();
  db.update(share)
    .set(
      paid
        ? {
            paidAt: opts.paidAt ?? now,
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

/**
 * Record one payment between housemates (Money → Record a payment): the
 * shares it covers are marked paid together, on the day it was made, by the
 * method given. Only unpaid shares of the household's bills, and only ones
 * owed to `toMemberId` (the payer of their bills) by one person, are taken;
 * the rest are left alone. Returns the shares marked and their total.
 */
export function recordPayment(
  householdId: string,
  input: {
    shareIds: string[];
    fromMemberId: string;
    toMemberId: string;
    method: 'transfer' | 'cash' | 'other';
    /** YYYY-MM-DD in the household's time zone; today when left out. */
    day?: string;
    markedByMemberId: string;
  },
  db: Db = getDb(),
): { shareIds: string[]; totalMinor: number } {
  if (!input.shareIds.length) return { shareIds: [], totalMinor: 0 };
  const rows = db
    .select({ s: share, payer: service.payerMemberId, owner: bill.ownerMemberId })
    .from(share)
    .innerJoin(bill, eq(share.billId, bill.id))
    .innerJoin(service, eq(bill.serviceId, service.id))
    .where(and(eq(share.householdId, householdId), inArray(share.id, input.shareIds)))
    .all()
    .filter(
      (r) =>
        !r.s.paidAt &&
        !r.owner &&
        r.s.memberId === input.fromMemberId &&
        r.payer === input.toMemberId &&
        r.s.paidMethod !== 'payer',
    );
  const paidAt = input.day ? `${input.day}T12:00:00.000Z` : undefined;
  for (const r of rows)
    setSharePaid(
      householdId,
      r.s.id,
      true,
      { method: input.method, markedByMemberId: input.markedByMemberId, paidAt },
      db,
    );
  return {
    shareIds: rows.map((r) => r.s.id),
    totalMinor: rows.reduce((sum, r) => sum + r.s.amountMinor, 0),
  };
}

/**
 * Record a payment to the provider (or undo one). A bill paid by instalments
 * takes it as its next instalment (as many as `amountMinor` covers, when a
 * receipt says how much was paid); undoing reopens the last paid instalment.
 */
export function setBillPaidToProvider(
  householdId: string,
  id: string,
  paid: boolean,
  db: Db = getDb(),
  /** When it was paid (a receipt's date); defaults to now. */
  at?: string,
  /** How much was paid, when known. */
  amountMinor?: number | null,
): void {
  const now = new Date().toISOString();
  const b = db
    .select({ paymentPlan: bill.paymentPlan })
    .from(bill)
    .where(and(eq(bill.householdId, householdId), eq(bill.id, id)))
    .get();
  const instalments = b?.paymentPlan === 'instalments' ? listInstalments([id], db) : [];
  if (!instalments.length) {
    db.update(bill)
      .set({ paidToProviderAt: paid ? (at ?? now) : null, updatedAt: now })
      .where(and(eq(bill.householdId, householdId), eq(bill.id, id)))
      .run();
    return;
  }
  if (paid) {
    let left = amountMinor ?? null;
    let marked = 0;
    for (const i of instalments.filter((x) => !x.paidToProviderAt)) {
      if (marked > 0 && (left === null || left < i.amountMinor)) break;
      i.paidToProviderAt = at ?? now;
      if (left !== null) left -= i.amountMinor;
      marked++;
    }
  } else {
    const last = instalments.filter((x) => x.paidToProviderAt).at(-1);
    if (last) last.paidToProviderAt = null;
  }
  saveInstalmentPayments(householdId, id, instalments, db);
}

/** Mark one instalment paid to the provider (or not). */
export function setInstalmentPaid(
  householdId: string,
  billId: string,
  seq: number,
  paid: boolean,
  db: Db = getDb(),
  at?: string,
): void {
  const instalments = listInstalments([billId], db).filter((i) => i.householdId === householdId);
  const target = instalments.find((i) => i.seq === seq);
  if (!target) throw new Error('Instalment not found');
  target.paidToProviderAt = paid
    ? (target.paidToProviderAt ?? at ?? new Date().toISOString())
    : null;
  saveInstalmentPayments(householdId, billId, instalments, db);
}

/**
 * Write instalments' payments and keep the bill in step: due on the next unpaid
 * instalment, paid to the provider once the last one is paid.
 */
function saveInstalmentPayments(
  householdId: string,
  billId: string,
  instalments: BillInstalment[],
  db: Db,
): void {
  const now = new Date().toISOString();
  const allPaid = instalments.every((i) => i.paidToProviderAt);
  db.transaction((tx) => {
    for (const i of instalments)
      tx.update(billInstalment)
        .set({ paidToProviderAt: i.paidToProviderAt })
        .where(eq(billInstalment.id, i.id))
        .run();
    tx.update(bill)
      .set({
        dueDate: instalmentDueDate(instalments),
        paidToProviderAt: allPaid
          ? instalments
              .map((i) => i.paidToProviderAt!)
              .sort()
              .at(-1)!
          : null,
        updatedAt: now,
      })
      .where(and(eq(bill.householdId, householdId), eq(bill.id, billId)))
      .run();
  });
}

export type PaymentPlan = 'full' | 'instalments';

/**
 * Choose how a bill that offers instalments is paid. Paying in full can only
 * be chosen up to the notice's pay-in-full date. Switching re-splits the bill
 * (per instalment, or as one amount), so it's refused once a housemate's share
 * or a payment to the provider has been recorded.
 */
export function setPaymentPlan(
  householdId: string,
  billId: string,
  plan: PaymentPlan,
  db: Db = getDb(),
  /** Today in the household's timezone (YYYY-MM-DD); defaults to now. */
  today?: string,
): BillDetail {
  const b = getBill(householdId, billId, db);
  if (!b) throw new Error('Bill not found');
  if (!b.instalments.length) throw new Error('This bill doesn’t offer instalments');
  const hh = getHousehold(householdId, db)!;
  if (
    plan === 'full' &&
    b.paymentPlan !== 'full' &&
    !fullPaymentOpen(b, today ?? todayIn(hh.timezone))
  )
    throw new Error('The date to pay this bill in full has passed');
  const current: PaymentPlan = b.paymentPlan ?? 'full';
  if (current === plan) {
    if (b.paymentPlan === null)
      db.update(bill)
        .set({ paymentPlan: plan, updatedAt: new Date().toISOString() })
        .where(eq(bill.id, billId))
        .run();
    return getBill(householdId, billId, db)!;
  }
  const lock = planLock(b);
  if (lock === 'shares')
    throw new Error('Someone has already paid their share, so the payment plan is locked');
  if (lock === 'provider')
    throw new Error(
      'A payment to the provider is already recorded. Undo it first to change the plan',
    );
  const amountMinor =
    plan === 'instalments'
      ? b.instalments.reduce((sum, i) => sum + i.amountMinor, 0)
      : (b.fullAmountMinor ?? b.amountMinor);
  const dueDate =
    plan === 'instalments' ? instalmentDueDate(b.instalments) : (b.fullDueDate ?? b.dueDate);
  const now = new Date().toISOString();
  db.transaction((tx) => {
    tx.update(bill)
      .set({ paymentPlan: plan, amountMinor, dueDate, updatedAt: now })
      .where(and(eq(bill.householdId, householdId), eq(bill.id, billId)))
      .run();
    if (hh.splitMode !== 'shared') return;
    tx.delete(share)
      .where(and(eq(share.householdId, householdId), eq(share.billId, billId)))
      .run();
    insertShares(
      tx,
      householdId,
      billId,
      b.service,
      { ...b, amountMinor, dueDate, currency: b.currency },
      hh.paymentReferenceTemplate,
      hh.locale,
      now,
      plan === 'instalments' ? b.instalments : [],
    );
  });
  if (amountMinor !== b.amountMinor) refreshAnomalies(householdId, b.serviceId, db);
  return getBill(householdId, billId, db)!;
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
      updatedAt: now,
    })
    .where(and(eq(bill.householdId, householdId), eq(bill.id, billId)))
    .run();
  // The payment didn't go through: by instalments, the last one paid is open again.
  if (kind === 'payment_failed') setBillPaidToProvider(householdId, billId, false, db);
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
  const horizon = addDays(today, 14);
  return bills.find((b) => b.dueDate <= horizon) ?? bills[bills.length - 1] ?? null;
}

/** Bills with an unresolved provider alert, newest first. */
export function billsWithAlerts(
  householdId: string,
  scope: Scope = {},
  db: Db = getDb(),
): BillListItem[] {
  return listBills(householdId, scope, db).filter((b) => b.alertKind);
}

/**
 * Make a service one member's own (or the household's again). Its bills move
 * with it: personal bills lose their shares, household bills are split again.
 * Refused once a housemate has paid a share of one of its bills.
 */
/** Has a housemate paid a share of any of this service's bills? Then it stays the household's. */
export function housematesPaid(householdId: string, serviceId: string, db: Db = getDb()): boolean {
  return db
    .select({ paidAt: share.paidAt, paidMethod: share.paidMethod })
    .from(share)
    .innerJoin(bill, eq(bill.id, share.billId))
    .where(and(eq(bill.householdId, householdId), eq(bill.serviceId, serviceId)))
    .all()
    .some((s) => s.paidAt && s.paidMethod !== 'payer');
}

export function setServiceOwner(
  householdId: string,
  serviceId: string,
  ownerMemberId: string | null,
  db: Db = getDb(),
): ServiceWithType {
  const svc = getService(householdId, serviceId, db);
  if (!svc) throw new Error('Service not found');
  if (svc.ownerMemberId === ownerMemberId) return svc;
  const hh = getHousehold(householdId, db)!;
  if (ownerMemberId && !listMembers(householdId, db).some((m) => m.id === ownerMemberId))
    throw new Error('Not a member of this household');
  const bills = db
    .select()
    .from(bill)
    .where(and(eq(bill.householdId, householdId), eq(bill.serviceId, serviceId)))
    .all();
  const ids = bills.map((b) => b.id);
  if (housematesPaid(householdId, serviceId, db))
    throw new Error(
      'Housemates have paid shares of its bills, so it has to stay a household service',
    );
  const now = new Date().toISOString();
  db.transaction((tx) => {
    tx.update(service)
      .set({
        ownerMemberId,
        ...(ownerMemberId ? { payerMemberId: ownerMemberId } : {}),
        updatedAt: now,
      })
      .where(and(eq(service.householdId, householdId), eq(service.id, serviceId)))
      .run();
    if (!ids.length) return;
    tx.update(bill).set({ ownerMemberId, updatedAt: now }).where(inArray(bill.id, ids)).run();
    tx.delete(share).where(inArray(share.billId, ids)).run();
    if (ownerMemberId || hh.splitMode !== 'shared') return;
    const moved = getService(householdId, serviceId, tx)!;
    const instalments = listInstalments(ids, tx);
    for (const b of bills)
      insertShares(
        tx,
        householdId,
        b.id,
        moved,
        { ...b, currency: b.currency },
        hh.paymentReferenceTemplate,
        hh.locale,
        now,
        b.paymentPlan === 'instalments' ? instalments.filter((i) => i.billId === b.id) : [],
      );
  });
  unlinkMismatchedAssets(householdId, ids, db);
  return getService(householdId, serviceId, db)!;
}

/**
 * The bills of a household service that a new split can still apply to: none
 * of their shares has been paid by a housemate (the same lock as editing a bill).
 */
export function resplittableBills(
  householdId: string,
  serviceId: string,
  db: Db = getDb(),
): Bill[] {
  const bills = db
    .select()
    .from(bill)
    .where(
      and(
        eq(bill.householdId, householdId),
        eq(bill.serviceId, serviceId),
        isNull(bill.ownerMemberId),
      ),
    )
    .all();
  if (!bills.length) return [];
  const paid = new Set(
    db
      .select({ billId: share.billId, paidAt: share.paidAt, paidMethod: share.paidMethod })
      .from(share)
      .where(
        inArray(
          share.billId,
          bills.map((b) => b.id),
        ),
      )
      .all()
      .filter((s) => s.paidAt && s.paidMethod !== 'payer')
      .map((s) => s.billId),
  );
  return bills.filter((b) => !paid.has(b.id));
}

/**
 * Split a service's bills again after its split or payer changed: every bill
 * nobody has paid a share of yet (see resplittableBills). Returns how many.
 */
export function resplitBills(householdId: string, serviceId: string, db: Db = getDb()): number {
  const hh = getHousehold(householdId, db)!;
  const svc = getService(householdId, serviceId, db);
  if (!svc || svc.ownerMemberId || hh.splitMode !== 'shared') return 0;
  const bills = resplittableBills(householdId, serviceId, db);
  if (!bills.length) return 0;
  const ids = bills.map((b) => b.id);
  const now = new Date().toISOString();
  db.transaction((tx) => {
    const instalments = listInstalments(ids, tx);
    tx.delete(share).where(inArray(share.billId, ids)).run();
    for (const b of bills)
      insertShares(
        tx,
        householdId,
        b.id,
        svc,
        { ...b, currency: b.currency },
        hh.paymentReferenceTemplate,
        hh.locale,
        now,
        b.paymentPlan === 'instalments' ? instalments.filter((i) => i.billId === b.id) : [],
      );
  });
  return bills.length;
}
