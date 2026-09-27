import { and, desc, eq, isNull } from 'drizzle-orm';
import { getDb, type Db } from '@/db/client';
import { loginCode } from '@/db/schema';
import { ulid } from '@/lib/ids';
import { rateLimit } from '@/lib/rate-limit';
import { keyedHash, normaliseEmail, randomDigits, safeEqual } from './tokens';

export const CODE_TTL_MS = 10 * 60_000;
export const CODE_MAX_ATTEMPTS = 5;

export type IssueResult = { ok: true; code: string } | { ok: false; reason: 'rate-limited' };

/**
 * Create a one-time sign-in code for an email. At most one per minute and five
 * per hour per address; issuing a new code retires the previous ones.
 */
export function issueLoginCode(email: string, db: Db = getDb(), now = Date.now()): IssueResult {
  const addr = normaliseEmail(email);
  if (
    !rateLimit(`code-minute:${addr}`, 1, 60_000, now) ||
    !rateLimit(`code-hour:${addr}`, 5, 3_600_000, now)
  )
    return { ok: false, reason: 'rate-limited' };
  const code = randomDigits(6);
  const created = new Date(now).toISOString();
  db.update(loginCode)
    .set({ consumedAt: created })
    .where(and(eq(loginCode.email, addr), isNull(loginCode.consumedAt)))
    .run();
  db.insert(loginCode)
    .values({
      id: ulid(),
      email: addr,
      codeHash: keyedHash(`${addr}:${code}`),
      expiresAt: new Date(now + CODE_TTL_MS).toISOString(),
      createdAt: created,
    })
    .run();
  return { ok: true, code };
}

export type VerifyResult =
  { ok: true } | { ok: false; reason: 'invalid' | 'expired' | 'too-many-attempts' };

/** Check a code for an email. Each wrong guess counts; five retire the code. */
export function verifyLoginCode(
  email: string,
  code: string,
  db: Db = getDb(),
  now = Date.now(),
): VerifyResult {
  const addr = normaliseEmail(email);
  const row = db
    .select()
    .from(loginCode)
    .where(and(eq(loginCode.email, addr), isNull(loginCode.consumedAt)))
    .orderBy(desc(loginCode.createdAt))
    .get();
  if (!row) return { ok: false, reason: 'invalid' };
  if (Date.parse(row.expiresAt) <= now) return { ok: false, reason: 'expired' };
  if (row.attempts >= CODE_MAX_ATTEMPTS) return { ok: false, reason: 'too-many-attempts' };
  const iso = new Date(now).toISOString();
  if (!safeEqual(keyedHash(`${addr}:${code.replace(/\D/g, '')}`), row.codeHash)) {
    const attempts = row.attempts + 1;
    db.update(loginCode)
      .set({ attempts, ...(attempts >= CODE_MAX_ATTEMPTS ? { consumedAt: iso } : {}) })
      .where(eq(loginCode.id, row.id))
      .run();
    return { ok: false, reason: attempts >= CODE_MAX_ATTEMPTS ? 'too-many-attempts' : 'invalid' };
  }
  db.update(loginCode).set({ consumedAt: iso }).where(eq(loginCode.id, row.id)).run();
  return { ok: true };
}
