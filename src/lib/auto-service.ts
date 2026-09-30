import { getDb, type Db } from '@/db/client';
import type { Cadence } from '@/db/schema';
import type { ExtractedBill } from '@/ingest/extractors/types';
import { daysInclusive } from '@/lib/dates';
import { sameProvider } from '@/lib/provider-match';
import { hasHousemates, listMembers } from '@/lib/members';
import type { Scope } from '@/lib/scope';
import {
  createService,
  listServices,
  listServiceTypes,
  updateService,
  type ServiceWithType,
} from '@/lib/services';
import { isAdmin } from '@/lib/roles';
import { somethingElseIn } from '@/lib/service-categories';

/**
 * A readable bill arrived from a provider the household has no service for:
 * set one up from the bill instead of asking someone to. The caller decides
 * whether the document may do this (see the pipeline's trust rules).
 */

/** "Red Energy Pty Ltd" → "Red Energy". */
export function cleanProviderName(name: string): string {
  return (
    name
      .trim()
      .replace(
        /[,.]?\s+(pty\.?\s*ltd\.?|pty\.?\s*limited|limited|ltd\.?|inc\.?|llc|plc|gmbh)$/i,
        '',
      )
      .trim() || name.trim()
  );
}

/** Billing frequency from the length of one billing period. */
export function cadenceFromPeriod(start: string, end: string): Cadence {
  const days = daysInclusive(start, end);
  if (days <= 8) return 'weekly';
  if (days <= 16) return 'fortnightly';
  if (days <= 35) return 'monthly';
  if (days <= 70) return 'bimonthly';
  if (days <= 100) return 'quarterly';
  if (days >= 330 && days <= 400) return 'annual';
  return 'irregular';
}

/**
 * Could a service of this type take a bill of that type? Yes when they're the
 * same, or either is "other" (unknown), so an unsure reading never splits a
 * service; and a service filed as "Something else" under a main service
 * (Physio under Health) takes any bill of that main service, since whoever
 * added it wasn't sure which kind it was. `categoryOf` gives a type's category.
 */
export function typeFits(
  serviceType: string,
  billType: string | null | undefined,
  categoryOf: (slug: string) => string | null = () => null,
): boolean {
  if (!billType || billType === 'other' || serviceType === 'other' || serviceType === billType)
    return true;
  const unsure = somethingElseIn(serviceType);
  return !!unsure && categoryOf(billType) === unsure;
}

/** Each type's category, for typeFits. */
export function categoryLookup(db: Db = getDb()): (slug: string) => string | null {
  const byType = new Map(listServiceTypes(db).map((t) => [t.slug, t.category]));
  return (slug) => byType.get(slug) ?? null;
}

/**
 * A bill of a known type landed on a service still filed as "Other" (set up
 * before that type existed, or from an unsure reading): file the service
 * under the bill's type (and so its colour). A service that was named after
 * its type ("Other") takes the new type's name, or the provider's for a
 * sub-service (Netflix under Subscriptions).
 * Returns the service, changed or not.
 */
export function promoteServiceType(
  householdId: string,
  svc: ServiceWithType,
  billType: string | null | undefined,
  db: Db = getDb(),
): ServiceWithType {
  if (svc.typeSlug !== 'other' || !billType || billType === 'other') return svc;
  const types = listServiceTypes(db);
  const type = types.find((t) => t.slug === billType);
  if (!type) return svc;
  const other = types.find((t) => t.slug === 'other');
  const namedAfterType = svc.name.trim().toLowerCase() === (other?.label ?? 'Other').toLowerCase();
  const taken = listServices(householdId, { includeInactive: true, everyone: true }, db).some(
    (s) => s.id !== svc.id && s.name.toLowerCase() === type.label.toLowerCase(),
  );
  return updateService(
    householdId,
    svc.id,
    {
      typeSlug: type.slug,
      ...(namedAfterType
        ? {
            name: type.hasSubServices
              ? svc.provider
              : taken
                ? `${type.label} (${svc.provider})`
                : type.label,
          }
        : {}),
    },
    db,
  );
}

export interface AutoServiceResult {
  service: ServiceWithType;
  created: boolean;
}

export function serviceForNewProvider(
  householdId: string,
  bill: ExtractedBill,
  opts: {
    payerMemberId?: string | null;
    trustedDomain?: string | null;
    /** The member the bill came from: a type that's usually personal becomes theirs. */
    member?: string | null;
    /** Services it may reuse (see documentScope); all by default. */
    scope?: Scope;
  },
  db: Db = getDb(),
): AutoServiceResult | null {
  const provider = cleanProviderName(bill.provider ?? '');
  if (!provider || !bill.periodStart || !bill.periodEnd) return null;
  const all = listServices(
    householdId,
    { includeInactive: true, ...(opts.scope ?? { everyone: true }) },
    db,
  );
  // A service for the same provider (a stopped one is switched back on) is
  // reused rather than duplicated, but only when exactly one fits; otherwise
  // a person picks. A sub-service someone cancelled stays cancelled: its new
  // bill is flagged as charged after cancelling instead.
  const same = all.filter((s) => sameProvider(s.provider, provider));
  const categoryOf = categoryLookup(db);
  const typed = same.filter((s) => typeFits(s.typeSlug, bill.serviceType, categoryOf));
  if (typed.length) {
    const exact = typed.filter((s) => s.typeSlug === bill.serviceType);
    const existing = typed.length === 1 ? typed[0]! : exact.length === 1 ? exact[0]! : null;
    if (!existing) return null;
    if (existing.cancelledAt) return { service: existing, created: false };
    if (!existing.isActive) updateService(householdId, existing.id, { isActive: true }, db);
    return { service: { ...existing, isActive: true }, created: false };
  }
  // Same provider, different kind of service (AGL gas beside AGL power): a new service.
  const types = listServiceTypes(db);
  const type =
    types.find((t) => t.slug === bill.serviceType) ?? types.find((t) => t.slug === 'other')!;
  // Car rego, car insurance: the member's own, when others live there too.
  // Either way, whoever brought the bill in is asked to confirm (ownership.ts).
  const together = hasHousemates(householdId, db);
  const owner = type.personalByDefault && opts.member && together ? opts.member : null;
  // A sub-service is named after its provider (Netflix, Red Cross); any other
  // service after its type.
  const name = type.hasSubServices
    ? provider
    : all.some((s) => s.name.toLowerCase() === type.label.toLowerCase())
      ? `${type.label} (${provider})`
      : type.label;
  const members = listMembers(householdId, db);
  const payer =
    (opts.payerMemberId && members.find((m) => m.id === opts.payerMemberId)?.id) ??
    members.find((m) => isAdmin(m))?.id ??
    null;
  const service = createService(
    householdId,
    {
      typeSlug: type.slug,
      name,
      provider,
      accountRef: bill.accountRef ?? null,
      cadence: cadenceFromPeriod(bill.periodStart, bill.periodEnd),
      usageUnit: bill.usageUnit ?? type.defaultUnit ?? null,
      splitMode: 'equal',
      payerMemberId: owner ?? payer,
      ownerMemberId: owner,
      setUpByMemberId: opts.member ?? null,
      ownerAskedAt: together ? new Date().toISOString() : null,
      autoPay: bill.autoPay ?? false,
      trustedSenders: opts.trustedDomain ? [opts.trustedDomain] : [],
      notes: 'Set up automatically from its first bill. Check who pays it and how it’s split.',
    },
    db,
  );
  return { service, created: true };
}
