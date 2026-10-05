import { asc, eq } from 'drizzle-orm';
import { getDb, type Db } from '@/db/client';
import { household, type Household } from '@/db/schema';
import type { AllowancePeriod, HouseholdType } from '@/lib/household-types';
import { ulid } from '@/lib/ids';

export function getHousehold(id: string, db: Db = getDb()): Household | null {
  return db.select().from(household).where(eq(household.id, id)).get() ?? null;
}

export function listHouseholds(db: Db = getDb()): Household[] {
  return db.select().from(household).orderBy(asc(household.createdAt), asc(household.id)).all();
}

/** The install's first household (local scripts use it, e.g. the extraction dry-run). */
export function primaryHousehold(db: Db = getDb()): Household | null {
  return listHouseholds(db)[0] ?? null;
}

/** True once any household exists (the first-run setup wizard closes). */
export function isSetUp(db: Db = getDb()): boolean {
  return primaryHousehold(db) !== null;
}

export interface HouseholdInput {
  name: string;
  currency: string;
  locale: string;
  timezone: string;
  fiscalYearStartMonth: number;
  weekStartsOn?: number;
  splitMode: 'shared' | 'single';
  /** What kind of household (SCOPE-accounts.md §7); null until an admin says. */
  type?: HouseholdType | null;
  /** A let property's address and utilities allowance (null: tenants pay directly). */
  address?: string | null;
  allowanceMinor?: number | null;
  allowancePeriod?: AllowancePeriod;
  paymentReferenceTemplate?: string;
  isDemo?: boolean;
  /** Share anonymised figures with area comparisons (default on). */
  shareRegional?: boolean;
  /** Members may download the household's bills, not just admins (default on). */
  membersCanExport?: boolean;
}

export function createHousehold(input: HouseholdInput, db: Db = getDb()): Household {
  const now = new Date().toISOString();
  const row = {
    id: ulid(),
    name: input.name.trim(),
    currency: input.currency.toUpperCase(),
    locale: input.locale,
    timezone: input.timezone,
    fiscalYearStartMonth: input.fiscalYearStartMonth,
    weekStartsOn: input.weekStartsOn ?? 1,
    splitMode: input.splitMode,
    type: input.type ?? null,
    address: input.address ?? null,
    allowanceMinor: input.allowanceMinor ?? null,
    allowancePeriod: input.allowancePeriod ?? 'month',
    aiCap: null,
    dataKey: null,
    paymentReferenceTemplate: input.paymentReferenceTemplate ?? '{service} {period} {member}',
    isDemo: input.isDemo ?? false,
    billsAlias: null,
    country: null,
    postalCode: null,
    locality: null,
    region: null,
    latitude: null,
    longitude: null,
    locationUpdatedAt: null,
    shareRegional: input.shareRegional ?? true,
    membersCanExport: input.membersCanExport ?? true,
    navLayout: null,
    createdAt: now,
    updatedAt: now,
  };
  db.insert(household).values(row).run();
  return row;
}

export function updateHousehold(
  id: string,
  patch: Partial<Omit<HouseholdInput, 'isDemo'>>,
  db: Db = getDb(),
): Household {
  if (!getHousehold(id, db)) throw new Error('Household not found');
  const values = {
    ...patch,
    ...(patch.name ? { name: patch.name.trim() } : {}),
    ...(patch.currency ? { currency: patch.currency.toUpperCase() } : {}),
    updatedAt: new Date().toISOString(),
  };
  db.update(household).set(values).where(eq(household.id, id)).run();
  return getHousehold(id, db)!;
}

/** Delete a household and, through ON DELETE CASCADE, every row it owns. Archived files stay on disk. */
export function deleteHousehold(id: string, db: Db = getDb()): void {
  db.delete(household).where(eq(household.id, id)).run();
}
