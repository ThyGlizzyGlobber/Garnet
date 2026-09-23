import { getDb, type Db } from '@/db/client';
import { household, type Household } from '@/db/schema';
import { ulid } from '@/lib/ids';

export function getHousehold(db: Db = getDb()): Household | null {
  return db.select().from(household).limit(1).get() ?? null;
}

export function isSetUp(db: Db = getDb()): boolean {
  return getHousehold(db) !== null;
}

export interface HouseholdInput {
  name: string;
  currency: string;
  locale: string;
  timezone: string;
  fiscalYearStartMonth: number;
  weekStartsOn?: number;
  splitMode: 'shared' | 'single';
  paymentReferenceTemplate?: string;
}

export function createHousehold(input: HouseholdInput, db: Db = getDb()): Household {
  if (getHousehold(db)) throw new Error('Household already exists');
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
    paymentReferenceTemplate: input.paymentReferenceTemplate ?? '{service} {period} {member}',
    createdAt: now,
    updatedAt: now,
  };
  db.insert(household).values(row).run();
  return row;
}

export function updateHousehold(patch: Partial<HouseholdInput>, db: Db = getDb()): Household {
  const current = getHousehold(db);
  if (!current) throw new Error('Household not set up');
  const values = {
    ...patch,
    ...(patch.name ? { name: patch.name.trim() } : {}),
    ...(patch.currency ? { currency: patch.currency.toUpperCase() } : {}),
    updatedAt: new Date().toISOString(),
  };
  db.update(household).set(values).run();
  return getHousehold(db)!;
}
