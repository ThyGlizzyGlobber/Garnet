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
import { paysNoShareByDefault } from '@/lib/household-types';
import { ulid } from '@/lib/ids';
import { DEFAULT_COLOUR, PALETTE } from '@/lib/palette';
import { getHousehold } from '@/lib/households';
import { getMember, listMembers } from '@/lib/members';
import { ownerCondition, type Scope } from '@/lib/scope';
import {
  CATEGORY_COLOURS,
  CATEGORY_ICONS,
  inMainCategory,
  type GroupedCategory,
} from '@/lib/service-categories';

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
    // Custom types take the palette in turn: the same colour in every household.
    colour: PALETTE[listServiceTypes(db).length % PALETTE.length]!.light,
    hasSubServices: false,
  };
  db.insert(serviceType).values(row).run();
  return row;
}

/** The colour every service of a type wears (service_type.colour). */
function typeColour(slug: string, db: Db): string {
  return typeRow(slug, db)?.colour ?? DEFAULT_COLOUR;
}

function typeRow(slug: string, db: Db): ServiceType | undefined {
  return db.select().from(serviceType).where(eq(serviceType.slug, slug)).get();
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
  isActive?: boolean;
  notes?: string | null;
  /** Email domains whose signed bills may be created automatically. */
  trustedSenders?: string[];
  /** Provider charges automatically (card on file / direct debit). */
  autoPay?: boolean;
  /**
   * The same charge every cadence (src/lib/recurring.ts). Defaults to on for
   * sub-services (Subscriptions, Donations); never for irregular bills.
   */
  recurring?: boolean;
  /** memberId → percentage or ratio; replaces the service's splits when provided. */
  customSplits?: Record<string, number>;
  /** Members who pay no share of it (D14). New services leave boarders out unless told otherwise. */
  notSplitWith?: string[];
  /** memberId → amount per bill (minor units); replaces the service's splits when provided. */
  fixedAmounts?: Record<string, number>;
  /** Personal to this member (only they see it; not split). Set on create; see setServiceOwner. */
  ownerMemberId?: string | null;
  /** Set up from a bill this member brought in; they're asked whether it's theirs (src/lib/ownership.ts). */
  setUpByMemberId?: string | null;
  ownerAskedAt?: string | null;
  /** Added by hand on Budget before any bill: its usual amount and roughly when it falls (src/lib/expected.ts). */
  expectedAmountMinor?: number | null;
  expectedOn?: string | null;
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
  const { customSplits, fixedAmounts, recurring, ...rest } = input;
  assertPayerInHousehold(householdId, rest.payerMemberId, db);
  assertPayerInHousehold(householdId, rest.ownerMemberId, db);
  const cadence = rest.cadence ?? 'monthly';
  const repeats =
    cadence !== 'irregular' && (recurring ?? !!typeRow(rest.typeSlug, db)?.hasSubServices);
  db.insert(service)
    .values({
      id,
      householdId,
      typeSlug: rest.typeSlug,
      name: rest.name.trim(),
      provider: rest.provider.trim(),
      accountRef: rest.accountRef ?? null,
      cadence,
      usageUnit: rest.usageUnit ?? null,
      usageLimitMonthly: rest.usageLimitMonthly ?? null,
      seasonal: rest.seasonal ?? SEASONAL_TYPES.includes(rest.typeSlug),
      splitMode: rest.splitMode ?? 'equal',
      // A personal service is paid by its owner.
      payerMemberId: rest.ownerMemberId ?? rest.payerMemberId ?? null,
      ownerMemberId: rest.ownerMemberId ?? null,
      setUpByMemberId: rest.setUpByMemberId ?? null,
      ownerAskedAt: rest.ownerAskedAt ?? null,
      colour: typeColour(rest.typeSlug, db),
      isActive: rest.isActive ?? true,
      notes: rest.notes ?? null,
      trustedSenders: rest.trustedSenders ?? [],
      autoPay: rest.autoPay ?? false,
      expectedAmountMinor: rest.expectedAmountMinor ?? null,
      expectedOn: rest.expectedOn ?? null,
      notSplitWith:
        rest.notSplitWith ??
        listMembers(householdId, db)
          .filter((m) => paysNoShareByDefault(m.role, getHousehold(householdId, db)?.type ?? null))
          .map((m) => m.id),
      recurringSince: repeats ? now : null,
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
  const { customSplits, fixedAmounts, recurring, ...rest } = input;
  delete rest.ownerMemberId;
  // Recurring from when it's switched on; left alone when it stays on.
  const cadence = rest.cadence ?? existing.cadence;
  const recurringSince =
    recurring === undefined
      ? cadence === 'irregular'
        ? null
        : existing.recurringSince
      : recurring && cadence !== 'irregular'
        ? (existing.recurringSince ?? new Date().toISOString())
        : null;
  // A personal service is always paid by its owner.
  if (existing.ownerMemberId) rest.payerMemberId = existing.ownerMemberId;
  assertPayerInHousehold(householdId, rest.payerMemberId, db);
  db.update(service)
    .set({
      ...rest,
      ...(rest.name ? { name: rest.name.trim() } : {}),
      ...(rest.provider ? { provider: rest.provider.trim() } : {}),
      // Its colour is its type's.
      ...(rest.typeSlug ? { colour: typeColour(rest.typeSlug, db) } : {}),
      ...(rest.isActive ? { cancelledAt: null, cancelledByMemberId: null } : {}),
      recurringSince,
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

/**
 * Someone cancelled a sub-service (their Netflix): it stops being active and
 * says who cancelled it and when; its bills stay. A bill dated after this is
 * flagged as charged after cancelling (chargedAfterCancel).
 */
export function cancelService(
  householdId: string,
  id: string,
  memberId: string,
  db: Db = getDb(),
): ServiceWithType {
  const svc = getService(householdId, id, db);
  if (!svc) throw new Error('Service not found');
  if (svc.cancelledAt) return svc;
  db.update(service)
    .set({
      isActive: false,
      cancelledAt: new Date().toISOString(),
      cancelledByMemberId: getMember(householdId, memberId, db) ? memberId : null,
      updatedAt: new Date().toISOString(),
    })
    .where(and(eq(service.householdId, householdId), eq(service.id, id)))
    .run();
  return getService(householdId, id, db)!;
}

/** Undo a cancellation: the sub-service is active again. */
export function resumeService(householdId: string, id: string, db: Db = getDb()): ServiceWithType {
  return updateService(householdId, id, { isActive: true }, db);
}

/**
 * Was this bill charged after its service was cancelled? Yes when the day it
 * belongs to (its issue date, else its period) falls after the cancelling day.
 */
export function chargedAfterCancel(
  svc: Pick<Service, 'cancelledAt'>,
  b: { issueDate: string | null; periodStart: string },
): boolean {
  if (!svc.cancelledAt) return false;
  return (b.issueDate ?? b.periodStart) > svc.cancelledAt.slice(0, 10);
}

export interface ServiceGroup<S> {
  /** The type slug for a main service with sub-services; null otherwise. */
  typeSlug: string | null;
  /**
   * A category that is a main service of its own (Vehicles, Health), its
   * types the sub-services; null otherwise. Its label is the page's to word.
   */
  category: GroupedCategory | null;
  label: string;
  icon: string;
  colour: string;
  services: S[];
}

/**
 * Services in list order, with each main service's sub-services gathered
 * under it where the first of them would have been: Subscriptions → Netflix,
 * Spotify (one service per provider), and Vehicles → Registration, Car
 * insurance (every service of the category's types). Every other service
 * stands on its own.
 */
export function groupServices<S extends { type: ServiceType }>(services: S[]): ServiceGroup<S>[] {
  const out: ServiceGroup<S>[] = [];
  const byKey = new Map<string, ServiceGroup<S>>();
  for (const s of services) {
    // Subscriptions keeps its own page even though it's a lifestyle type.
    const category = inMainCategory(s.type) ? (s.type.category as GroupedCategory) : null;
    if (!category && !s.type.hasSubServices) {
      out.push({
        typeSlug: null,
        category: null,
        label: '',
        icon: s.type.icon,
        colour: s.type.colour,
        services: [s],
      });
      continue;
    }
    const key = category ? `c:${category}` : `t:${s.type.slug}`;
    let g = byKey.get(key);
    if (!g) {
      g = category
        ? {
            typeSlug: null,
            category,
            label: '',
            icon: CATEGORY_ICONS[category],
            colour: CATEGORY_COLOURS[category],
            services: [],
          }
        : {
            typeSlug: s.type.slug,
            category: null,
            label: s.type.label,
            icon: s.type.icon,
            colour: s.type.colour,
            services: [],
          };
      byKey.set(key, g);
      out.push(g);
    }
    g.services.push(s);
  }
  return out;
}

/** A grouped category's services by type, in list order: its sub-services. */
export function byType<S extends { type: ServiceType }>(
  services: S[],
): { type: ServiceType; services: S[] }[] {
  const out: { type: ServiceType; services: S[] }[] = [];
  for (const s of services) {
    const g = out.find((x) => x.type.slug === s.type.slug);
    if (g) g.services.push(s);
    else out.push({ type: s.type, services: [s] });
  }
  return out;
}

/**
 * The main service a service belongs to, as a page: Subscriptions for a
 * subscription, Vehicles, Health or Lifestyle for theirs; null for a service
 * on its own. Back links and the nav lead there.
 */
export function mainServiceOf(svc: {
  typeSlug: string;
  type: { slug: string; category: string; hasSubServices: boolean };
}): string | null {
  if (inMainCategory(svc.type)) return `/services/category/${svc.type.category}`;
  if (svc.type.hasSubServices) return `/services/group/${svc.typeSlug}`;
  return null;
}
