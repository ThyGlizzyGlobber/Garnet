import { and, asc, eq } from 'drizzle-orm';
import { getDb, type Db } from '@/db/client';
import {
  service,
  serviceSplit,
  serviceType,
  type Cadence,
  type Service,
  type ServiceType,
  type SplitMode,
} from '@/db/schema';
import { ulid } from '@/lib/ids';
import { DEFAULT_COLOUR } from '@/lib/palette';
import { getMember } from '@/lib/members';
import { ownerCondition, type Scope } from '@/lib/scope';

export type ServiceWithType = Service & { type: ServiceType };

export function listServiceTypes(db: Db = getDb()): ServiceType[] {
  return db
    .select()
    .from(serviceType)
    .orderBy(asc(serviceType.sortOrder), asc(serviceType.label))
    .all();
}

export function createServiceType(
  input: { slug: string; label: string; defaultUnit?: string | null; icon?: string },
  db: Db = getDb(),
): ServiceType {
  const row = {
    slug: input.slug
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-'),
    label: input.label.trim(),
    defaultUnit: input.defaultUnit ?? null,
    icon: input.icon ?? 'receipt',
    sortOrder: 500,
    isBuiltin: false,
    personalByDefault: false,
    category: 'other',
  };
  db.insert(serviceType).values(row).run();
  return row;
}

/**
 * A household's services. Household ones only unless the scope asks for a
 * member's personal ones too (see Scope).
 */
export function listServices(
  householdId: string,
  opts: { includeInactive?: boolean } & Scope = {},
  db: Db = getDb(),
): ServiceWithType[] {
  const rows = db
    .select()
    .from(service)
    .innerJoin(serviceType, eq(service.typeSlug, serviceType.slug))
    .where(and(eq(service.householdId, householdId), ownerCondition(service.ownerMemberId, opts)))
    .orderBy(asc(serviceType.sortOrder), asc(service.name))
    .all();
  return rows
    .map((r) => ({ ...r.service, type: r.service_type }))
    .filter((s) => opts.includeInactive || s.isActive);
}

export function getService(
  householdId: string,
  id: string,
  db: Db = getDb(),
): ServiceWithType | null {
  const r = db
    .select()
    .from(service)
    .innerJoin(serviceType, eq(service.typeSlug, serviceType.slug))
    .where(and(eq(service.householdId, householdId), eq(service.id, id)))
    .get();
  return r ? { ...r.service, type: r.service_type } : null;
}

export function getCustomSplits(
  householdId: string,
  serviceId: string,
  db: Db = getDb(),
): Record<string, number> {
  return Object.fromEntries(
    splitRows(householdId, serviceId, db)
      .filter((r) => r.amountMinor === null)
      .map((r) => [r.memberId, r.weight]),
  );
}

/** 'fixed' splits: what each member pays of a bill, in minor units. */
export function getFixedAmounts(
  householdId: string,
  serviceId: string,
  db: Db = getDb(),
): Record<string, number> {
  return Object.fromEntries(
    splitRows(householdId, serviceId, db)
      .filter((r) => r.amountMinor !== null)
      .map((r) => [r.memberId, r.amountMinor!]),
  );
}

function splitRows(householdId: string, serviceId: string, db: Db) {
  return db
    .select()
    .from(serviceSplit)
    .where(and(eq(serviceSplit.householdId, householdId), eq(serviceSplit.serviceId, serviceId)))
    .all();
}

/** What computeShares needs besides the members: the service's percentages or amounts. */
export function splitSettings(
  householdId: string,
  svc: Pick<ServiceWithType, 'id' | 'splitMode'>,
  db: Db = getDb(),
): { customWeights?: Record<string, number>; fixedAmounts?: Record<string, number> } {
  if (svc.splitMode === 'percent')
    return { customWeights: getCustomSplits(householdId, svc.id, db) };
  if (svc.splitMode === 'fixed') return { fixedAmounts: getFixedAmounts(householdId, svc.id, db) };
  return {};
}

export interface ServiceInput {
  typeSlug: string;
  name: string;
  provider: string;
  accountRef?: string | null;
  cadence?: Cadence;
  usageUnit?: string | null;
  /** Usage limit per month, in usageUnit. */
  usageLimitMonthly?: number | null;
  /** Cost changes with the seasons; defaults to on for electricity and gas. */
  seasonal?: boolean;
  splitMode?: SplitMode;
  payerMemberId?: string | null;
  colour?: string;
  isActive?: boolean;
  notes?: string | null;
  /** Email domains whose signed bills may be created automatically. */
  trustedSenders?: string[];
  /** Provider charges automatically (card on file / direct debit). */
  autoPay?: boolean;
  /** memberId → percentage or ratio; replaces the service's splits when provided. */
  customSplits?: Record<string, number>;
  /** memberId → amount per bill (minor units); replaces the service's splits when provided. */
  fixedAmounts?: Record<string, number>;
  /** Personal to this member (only they see it; not split). Set on create; see setServiceOwner. */
  ownerMemberId?: string | null;
  /** Set up from a bill this member brought in; they're asked whether it's theirs (src/lib/ownership.ts). */
  setUpByMemberId?: string | null;
  ownerAskedAt?: string | null;
}

/** A payer from another household would leak data across households; refuse it. */
function assertPayerInHousehold(
  householdId: string,
  payerMemberId: string | null | undefined,
  db: Db,
) {
  if (payerMemberId && !getMember(householdId, payerMemberId, db))
    throw new Error('Payer is not a member of this household');
}

/** Service types whose cost follows the seasons unless the household says otherwise. */
export const SEASONAL_TYPES = ['electricity', 'gas'];

export function createService(
  householdId: string,
  input: ServiceInput,
  db: Db = getDb(),
): ServiceWithType {
  const now = new Date().toISOString();
  const id = ulid();
  const { customSplits, fixedAmounts, ...rest } = input;
  assertPayerInHousehold(householdId, rest.payerMemberId, db);
  assertPayerInHousehold(householdId, rest.ownerMemberId, db);
  db.insert(service)
    .values({
      id,
      householdId,
      typeSlug: rest.typeSlug,
      name: rest.name.trim(),
      provider: rest.provider.trim(),
      accountRef: rest.accountRef ?? null,
      cadence: rest.cadence ?? 'monthly',
      usageUnit: rest.usageUnit ?? null,
      usageLimitMonthly: rest.usageLimitMonthly ?? null,
      seasonal: rest.seasonal ?? SEASONAL_TYPES.includes(rest.typeSlug),
      splitMode: rest.splitMode ?? 'equal',
      // A personal service is paid by its owner.
      payerMemberId: rest.ownerMemberId ?? rest.payerMemberId ?? null,
      ownerMemberId: rest.ownerMemberId ?? null,
      setUpByMemberId: rest.setUpByMemberId ?? null,
      ownerAskedAt: rest.ownerAskedAt ?? null,
      colour: rest.colour ?? DEFAULT_COLOUR,
      isActive: rest.isActive ?? true,
      notes: rest.notes ?? null,
      trustedSenders: rest.trustedSenders ?? [],
      autoPay: rest.autoPay ?? false,
      createdAt: now,
      updatedAt: now,
    })
    .run();
  if (fixedAmounts) setFixedAmounts(householdId, id, fixedAmounts, db);
  else if (customSplits) setCustomSplits(householdId, id, customSplits, db);
  return getService(householdId, id, db)!;
}

export function updateService(
  householdId: string,
  id: string,
  input: Partial<ServiceInput>,
  db: Db = getDb(),
): ServiceWithType {
  const existing = getService(householdId, id, db);
  if (!existing) throw new Error('Service not found');
  // Who owns it changes only through setServiceOwner (its bills and shares move too).
  const { customSplits, fixedAmounts, ...rest } = input;
  delete rest.ownerMemberId;
  // A personal service is always paid by its owner.
  if (existing.ownerMemberId) rest.payerMemberId = existing.ownerMemberId;
  assertPayerInHousehold(householdId, rest.payerMemberId, db);
  db.update(service)
    .set({
      ...rest,
      ...(rest.name ? { name: rest.name.trim() } : {}),
      ...(rest.provider ? { provider: rest.provider.trim() } : {}),
      updatedAt: new Date().toISOString(),
    })
    .where(and(eq(service.householdId, householdId), eq(service.id, id)))
    .run();
  if (fixedAmounts) setFixedAmounts(householdId, id, fixedAmounts, db);
  else if (customSplits) setCustomSplits(householdId, id, customSplits, db);
  return getService(householdId, id, db)!;
}

/** Replace a service's split with amounts per bill (0 = pays nothing; members left out share the rest). */
function setFixedAmounts(
  householdId: string,
  serviceId: string,
  amounts: Record<string, number>,
  db: Db = getDb(),
) {
  if (!getService(householdId, serviceId, db)) throw new Error('Service not found');
  db.delete(serviceSplit)
    .where(and(eq(serviceSplit.householdId, householdId), eq(serviceSplit.serviceId, serviceId)))
    .run();
  const rows = Object.entries(amounts)
    .filter(
      ([memberId, a]) => a >= 0 && Number.isInteger(a) && getMember(householdId, memberId, db),
    )
    .map(([memberId, amountMinor]) => ({
      householdId,
      serviceId,
      memberId,
      weight: 0,
      amountMinor,
    }));
  if (rows.length) db.insert(serviceSplit).values(rows).run();
}

/** Replace a service's custom weights. Weights for members of other households are dropped. */
export function setCustomSplits(
  householdId: string,
  serviceId: string,
  weights: Record<string, number>,
  db: Db = getDb(),
) {
  if (!getService(householdId, serviceId, db)) throw new Error('Service not found');
  db.delete(serviceSplit)
    .where(and(eq(serviceSplit.householdId, householdId), eq(serviceSplit.serviceId, serviceId)))
    .run();
  const rows = Object.entries(weights)
    .filter(([memberId, w]) => w > 0 && getMember(householdId, memberId, db))
    .map(([memberId, weight]) => ({ householdId, serviceId, memberId, weight }));
  if (rows.length) db.insert(serviceSplit).values(rows).run();
}
