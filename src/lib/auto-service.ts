import { getDb, type Db } from '@/db/client';
import type { Cadence } from '@/db/schema';
import type { ExtractedBill } from '@/ingest/extractors/types';
import { daysInclusive } from '@/lib/dates';
import { listMembers } from '@/lib/members';
import { nextPaletteColour, TYPE_COLOUR } from '@/lib/palette';
import {
  createService,
  listServices,
  listServiceTypes,
  updateService,
  type ServiceWithType,
} from '@/lib/services';

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

const compact = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

export function sameProvider(a: string, b: string): boolean {
  const x = compact(a);
  const y = compact(b);
  if (!x || !y) return false;
  if (x === y) return true;
  const [short, long] = x.length <= y.length ? [x, y] : [y, x];
  return (
    (short.length >= 4 && long.includes(short)) || (short.length >= 3 && long.startsWith(short))
  );
}

export interface AutoServiceResult {
  service: ServiceWithType;
  created: boolean;
}

export function serviceForNewProvider(
  householdId: string,
  bill: ExtractedBill,
  opts: { payerMemberId?: string | null; trustedDomain?: string | null },
  db: Db = getDb(),
): AutoServiceResult | null {
  const provider = cleanProviderName(bill.provider ?? '');
  if (!provider || !bill.periodStart || !bill.periodEnd) return null;
  const all = listServices(householdId, { includeInactive: true }, db);
  // A service for the same provider (a cancelled one is switched back on) is
  // reused rather than duplicated, but only when exactly one fits; otherwise
  // a person picks.
  const same = all.filter((s) => sameProvider(s.provider, provider));
  if (same.length) {
    const fits = same.length === 1 ? same : same.filter((s) => s.typeSlug === bill.serviceType);
    const existing = fits.length === 1 ? fits[0]! : null;
    if (!existing) return null;
    if (!existing.isActive) updateService(householdId, existing.id, { isActive: true }, db);
    return { service: { ...existing, isActive: true }, created: false };
  }
  const types = listServiceTypes(db);
  const type =
    types.find((t) => t.slug === bill.serviceType) ?? types.find((t) => t.slug === 'other')!;
  const name = all.some((s) => s.name.toLowerCase() === type.label.toLowerCase())
    ? `${type.label} (${provider})`
    : type.label;
  const members = listMembers(householdId, db);
  const payer =
    (opts.payerMemberId && members.find((m) => m.id === opts.payerMemberId)?.id) ??
    members.find((m) => m.role === 'owner')?.id ??
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
      payerMemberId: payer,
      colour: TYPE_COLOUR[type.slug] ?? nextPaletteColour(all.map((s) => s.colour)),
      autoPay: bill.autoPay ?? false,
      trustedSenders: opts.trustedDomain ? [opts.trustedDomain] : [],
      notes: 'Set up automatically from its first bill. Check who pays it and how it’s split.',
    },
    db,
  );
  return { service, created: true };
}
