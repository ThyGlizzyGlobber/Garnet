import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { getDb, type Db } from '@/db/client';
import { household } from '@/db/schema';
import { getEnv } from '@/lib/env';

/**
 * Bill files encrypted at rest (SCOPE-console.md §5b, C-D11): each household
 * has its own 256-bit key, kept in the database wrapped with the install's
 * master key (DATA_KEY, from the environment, never from the data directory).
 * Files under inbox/, originals/ and previews/ are AES-256-GCM with a random
 * nonce per file and the household id as associated data, so a file can't be
 * read under another household's key or moved between households.
 *
 * Without DATA_KEY nothing is encrypted (the local demo, tests); once any
 * household has a key the app refuses to start without it (src/worker/startup.ts).
 * Files written before the key existed stay readable: the reader looks for
 * the header and passes plain files through.
 */
const MAGIC = Buffer.from('GRN1');
const NONCE = 12;
const TAG = 16;

function masterKey(): Buffer | null {
  const raw = getEnv().DATA_KEY;
  if (!raw) return null;
  const key = Buffer.from(raw, 'base64');
  if (key.length !== 32) throw new Error('DATA_KEY must be 32 random bytes, base64-encoded');
  return key;
}

export const dataKeyConfigured = (): boolean => !!getEnv().DATA_KEY;

/** Seal bytes: magic · nonce · tag · ciphertext. */
export function encryptBytes(plain: Buffer, key: Buffer, aad: string): Buffer {
  const nonce = randomBytes(NONCE);
  const cipher = createCipheriv('aes-256-gcm', key, nonce);
  cipher.setAAD(Buffer.from(aad));
  const body = Buffer.concat([cipher.update(plain), cipher.final()]);
  return Buffer.concat([MAGIC, nonce, cipher.getAuthTag(), body]);
}

export const isEncrypted = (buf: Buffer): boolean =>
  buf.length >= MAGIC.length + NONCE + TAG && buf.subarray(0, MAGIC.length).equals(MAGIC);

export function decryptBytes(sealed: Buffer, key: Buffer, aad: string): Buffer {
  if (!isEncrypted(sealed)) throw new Error('Not an encrypted file');
  const nonce = sealed.subarray(MAGIC.length, MAGIC.length + NONCE);
  const tag = sealed.subarray(MAGIC.length + NONCE, MAGIC.length + NONCE + TAG);
  const body = sealed.subarray(MAGIC.length + NONCE + TAG);
  const decipher = createDecipheriv('aes-256-gcm', key, nonce);
  decipher.setAAD(Buffer.from(aad));
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(body), decipher.final()]);
}

/** A household key wrapped with the master key, as text for the database. */
export function wrapKey(raw: Buffer, master: Buffer): string {
  return `v1.${encryptBytes(raw, master, 'household-key').toString('base64')}`;
}

export function unwrapKey(wrapped: string, master: Buffer): Buffer {
  const [v, b64] = wrapped.split('.');
  if (v !== 'v1' || !b64) throw new Error('Unknown key wrapping');
  return decryptBytes(Buffer.from(b64, 'base64'), master, 'household-key');
}

/**
 * The household's file key: made and stored the first time it is asked for
 * (when a master key is configured), null when files are kept plain. A key
 * that exists without the master key to open it is an error worth stopping for.
 */
export function householdKey(householdId: string, db: Db = getDb()): Buffer | null {
  const master = masterKey();
  const row = db
    .select({ dataKey: household.dataKey })
    .from(household)
    .where(eq(household.id, householdId))
    .get();
  if (!row) throw new Error('Household not found');
  if (row.dataKey) {
    if (!master) throw new Error('This household’s files are encrypted and DATA_KEY is not set');
    return unwrapKey(row.dataKey, master);
  }
  if (!master) return null;
  const raw = randomBytes(32);
  db.update(household)
    .set({ dataKey: wrapKey(raw, master) })
    .where(eq(household.id, householdId))
    .run();
  return raw;
}

/** Whether any household already has a key (then the master key is required to start). */
export function anyHouseholdKeyed(db: Db = getDb()): boolean {
  return db
    .select({ dataKey: household.dataKey })
    .from(household)
    .all()
    .some((h) => !!h.dataKey);
}

/** Seal a file's bytes for a household, or leave them plain when files aren't encrypted here. */
export function sealFor(householdId: string, plain: Buffer, db: Db = getDb()): Buffer {
  const key = householdKey(householdId, db);
  return key ? encryptBytes(plain, key, householdId) : plain;
}

/** Open a file's bytes: encrypted ones with the household's key, older plain ones as they are. */
export function openFor(householdId: string, stored: Buffer, db: Db = getDb()): Buffer {
  if (!isEncrypted(stored)) return stored;
  const key = householdKey(householdId, db);
  if (!key) throw new Error('This household’s files are encrypted and DATA_KEY is not set');
  return decryptBytes(stored, key, householdId);
}
