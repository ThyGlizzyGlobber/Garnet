import { createHmac, randomInt } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { getDb, type Db } from '@/db/client';
import { household, type Household } from '@/db/schema';
import { safeEqual } from '@/lib/auth/tokens';
import { getEnv, type Env } from '@/lib/env';

/**
 * Each household gets its own address for bills: BILLS_ADDRESS_TEMPLATE with
 * {alias} filled in, e.g. smith-7k2f@brjlabs.com. The Cloudflare Email Worker
 * posts every message to /api/inbound/email; the recipient names the household.
 */

const ALPHABET = '23456789abcdefghjkmnpqrstuvwxyz';

/** "Smith Household" → "smith-7k2f". Readable prefix, random suffix so it can't be guessed. */
export function generateAlias(name: string): string {
  const slug =
    name
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/\b(household|house|home|family|the)\b/g, ' ')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 12)
      .replace(/-+$/, '') || 'home';
  let suffix = '';
  for (let i = 0; i < 5; i++) suffix += ALPHABET[randomInt(ALPHABET.length)];
  return `${slug}-${suffix}`;
}

function addressFor(alias: string, env: Env = getEnv()): string | null {
  return env.BILLS_ADDRESS_TEMPLATE ? env.BILLS_ADDRESS_TEMPLATE.replace('{alias}', alias) : null;
}

/** The alias inside a recipient address, if it matches the template (case-insensitive). */
export function aliasFromRecipient(recipient: string, env: Env = getEnv()): string | null {
  const template = env.BILLS_ADDRESS_TEMPLATE;
  if (!template) return null;
  const [before, after] = template.toLowerCase().split('{alias}') as [string, string];
  const addr = recipient
    .trim()
    .toLowerCase()
    .replace(/^.*<([^>]+)>.*$/, '$1');
  if (!addr.startsWith(before) || !addr.endsWith(after)) return null;
  const alias = addr.slice(before.length, addr.length - after.length);
  return /^[a-z0-9]+(-[a-z0-9]+)*$/.test(alias) ? alias : null;
}

export function householdByAlias(alias: string, db: Db = getDb()): Household | null {
  return db.select().from(household).where(eq(household.billsAlias, alias)).get() ?? null;
}

/** The household's bills address, creating its alias on first use. Null when inbound email is off. */
export function billsAddress(hh: Household, db: Db = getDb()): string | null {
  if (!getEnv().BILLS_ADDRESS_TEMPLATE) return null;
  return addressFor(hh.billsAlias ?? assignAlias(hh, db));
}

function assignAlias(hh: Household, db: Db): string {
  for (let i = 0; i < 5; i++) {
    const alias = generateAlias(hh.name);
    try {
      db.update(household)
        .set({ billsAlias: alias, updatedAt: new Date().toISOString() })
        .where(eq(household.id, hh.id))
        .run();
      return alias;
    } catch {
      // Unique clash: try another suffix.
    }
  }
  throw new Error('Could not create a bills address');
}

/** Admin: replace the address (e.g. it's getting spam). The old one stops working at once. */
export function replaceAlias(hh: Household, db: Db = getDb()): string {
  return assignAlias(hh, db);
}

// ─── Worker → app signature ──────────────────────────────────────────────────
//
// v2 ("v2=<hex>"): HMAC-SHA256 over "v2.<timestamp>.<recipient>." followed by the
// raw message, so a delivery can't be replayed to another household's address.
// v1 ("sha256=<hex>", timestamp and message only) is what Workers deployed
// before 2026-09-29 send; src/ingest/inbound.ts accepts it only until the first
// v2 delivery arrives.

/** Accept deliveries signed within five minutes either side of now. */
const SIGNATURE_WINDOW_S = 300;

export function signDelivery(
  secret: string,
  timestamp: string,
  recipient: string,
  body: Buffer,
): string {
  const mac = createHmac('sha256', secret)
    .update(`v2.${timestamp}.${recipient}.`)
    .update(body)
    .digest('hex');
  return `v2=${mac}`;
}

/** The older signature, without the recipient (tests and the v1 check only). */
export function signDeliveryV1(secret: string, timestamp: string, body: Buffer): string {
  return `sha256=${createHmac('sha256', secret).update(`${timestamp}.`).update(body).digest('hex')}`;
}

/** Which signature a genuine, fresh delivery carries, or false. */
export function verifyDelivery(
  secret: string,
  headers: { timestamp: string | null; signature: string | null; recipient: string | null },
  body: Buffer,
  nowS = Math.floor(Date.now() / 1000),
): 'v2' | 'v1' | false {
  const ts = Number(headers.timestamp);
  const sig = headers.signature;
  if (!sig || !Number.isInteger(ts)) return false;
  if (Math.abs(nowS - ts) > SIGNATURE_WINDOW_S) return false;
  if (sig.startsWith('v2='))
    return safeEqual(signDelivery(secret, String(ts), headers.recipient ?? '', body), sig)
      ? 'v2'
      : false;
  return safeEqual(signDeliveryV1(secret, String(ts), body), sig) ? 'v1' : false;
}
