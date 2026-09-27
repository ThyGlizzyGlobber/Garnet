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
import { getMember } from '@/lib/members';

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
  };
  db.insert(serviceType).values(row).run();
  return row;
}

export function listServices(
  householdId: string,
  opts: { includeInactive?: boolean } = {},
  db: Db = getDb(),
): ServiceWithType[] {
  const rows = db
    .select()
    .from(service)
    .innerJoin(serviceType, eq(service.typeSlug, serviceType.slug))
    .where(eq(service.householdId, householdId))
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
  const rows = db
    .select()
    .from(serviceSplit)
    .where(and(eq(serviceSplit.householdId, householdId), eq(serviceSplit.serviceId, serviceId)))
    .all();
  return Object.fromEntries(rows.map((r) => [r.memberId, r.weight]));
}

export interface ServiceInput {
  typeSlug: string;
  name: string;
  provider: string;
  accountRef?: string | null;
  cadence?: Cadence;
  usageUnit?: string | null;
  splitMode?: SplitMode;
  payerMemberId?: string | null;
  colour?: string;
  isActive?: boolean;
  notes?: string | null;
  /** Email domains whose signed bills may be created automatically. */
  trustedSenders?: string[];
  /** memberId → weight; replaces existing custom splits when provided. */
  customSplits?: Record<string, number>;
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

export function createService(
  householdId: string,
  input: ServiceInput,
  db: Db = getDb(),
): ServiceWithType {
  const now = new Date().toISOString();
  const id = ulid();
  const { customSplits, ...rest } = input;
  assertPayerInHousehold(householdId, rest.payerMemberId, db);
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
      splitMode: rest.splitMode ?? 'equal',
      payerMemberId: rest.payerMemberId ?? null,
      colour: rest.colour ?? '#0a84ff',
      isActive: rest.isActive ?? true,
      notes: rest.notes ?? null,
      trustedSenders: rest.trustedSenders ?? [],
      createdAt: now,
      updatedAt: now,
    })
    .run();
  if (customSplits) setCustomSplits(householdId, id, customSplits, db);
  return getService(householdId, id, db)!;
}

export function updateService(
  householdId: string,
  id: string,
  input: Partial<ServiceInput>,
  db: Db = getDb(),
): ServiceWithType {
  if (!getService(householdId, id, db)) throw new Error('Service not found');
  const { customSplits, ...rest } = input;
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
  if (customSplits) setCustomSplits(householdId, id, customSplits, db);
  return getService(householdId, id, db)!;
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
