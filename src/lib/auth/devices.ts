import { and, eq, ne } from 'drizzle-orm';
import { getDb, type Db } from '@/db/client';
import { device, type Device } from '@/db/schema';
import { getEnv } from '@/lib/env';
import { ulid } from '@/lib/ids';
import { randomToken, sha256 } from './tokens';

/** Wrong PINs allowed on a device before it must fully sign in again. */
export const PIN_MAX_FAILURES = 5;

/** Trust this browser for an account after a full sign-in. Returns the raw cookie token. */
export function trustDevice(
  accountId: string,
  label: string | null,
  db: Db = getDb(),
  now = Date.now(),
): { device: Device; token: string } {
  const token = randomToken();
  const iso = new Date(now).toISOString();
  const row: Device = {
    id: ulid(),
    accountId,
    tokenHash: sha256(token),
    label: label?.slice(0, 120) ?? null,
    pinFailures: 0,
    createdAt: iso,
    lastSeenAt: iso,
    expiresAt: new Date(now + getEnv().AUTH_DEVICE_DAYS * 86_400_000).toISOString(),
  };
  db.insert(device).values(row).run();
  return { device: row, token };
}

/** The trusted device for a cookie token, if it still exists, hasn't expired and belongs to the account. */
export function findDevice(
  token: string | undefined,
  accountId: string,
  db: Db = getDb(),
  now = Date.now(),
): Device | null {
  if (!token) return null;
  const row = db
    .select()
    .from(device)
    .where(eq(device.tokenHash, sha256(token)))
    .get();
  if (!row || row.accountId !== accountId || Date.parse(row.expiresAt) <= now) return null;
  return row;
}

export function touchDevice(id: string, db: Db = getDb()): void {
  db.update(device).set({ lastSeenAt: new Date().toISOString() }).where(eq(device.id, id)).run();
}

/** Count a wrong PIN; at the limit the device is forgotten and a full sign-in is needed. */
export function recordPinFailure(
  id: string,
  db: Db = getDb(),
): { forgotten: boolean; remaining: number } {
  const row = db.select().from(device).where(eq(device.id, id)).get();
  const failures = (row?.pinFailures ?? PIN_MAX_FAILURES) + 1;
  if (!row || failures >= PIN_MAX_FAILURES) {
    forgetDevice(id, db);
    return { forgotten: true, remaining: 0 };
  }
  db.update(device).set({ pinFailures: failures }).where(eq(device.id, id)).run();
  return { forgotten: false, remaining: PIN_MAX_FAILURES - failures };
}

export function resetPinFailures(id: string, db: Db = getDb()): void {
  db.update(device).set({ pinFailures: 0 }).where(eq(device.id, id)).run();
}

export function forgetDevice(id: string, db: Db = getDb()): void {
  db.delete(device).where(eq(device.id, id)).run();
}

export function countDevices(accountId: string, db: Db = getDb()): number {
  return db.select().from(device).where(eq(device.accountId, accountId)).all().length;
}

/** Sign out everywhere except this browser (lost phone, shared computer). */
export function forgetOtherDevices(accountId: string, keepId: string, db: Db = getDb()): number {
  return db
    .delete(device)
    .where(and(eq(device.accountId, accountId), ne(device.id, keepId)))
    .run().changes;
}
