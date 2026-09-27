import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { getEnv } from '@/lib/env';

/** 32 random bytes, URL-safe. For links and cookies. */
export function randomToken(): string {
  return randomBytes(32).toString('base64url');
}

/** Crockford base32 without look-alikes (no I, L, O, U). */
const CODE_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/** Short code a person can type, e.g. "K7M4-QX2P" (40 bits). */
export function randomTypedCode(): string {
  let s = '';
  for (let i = 0; i < 8; i++) s += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return `${s.slice(0, 4)}-${s.slice(4)}`;
}

/** Normalise what a person typed: case, spaces, dashes, and O/I/L look-alikes. */
export function normaliseTypedCode(input: string): string {
  const s = input.toUpperCase().replace(/[\s-]/g, '').replace(/O/g, '0').replace(/[IL]/g, '1');
  return s.length === 8 ? `${s.slice(0, 4)}-${s.slice(4)}` : s;
}

/** Six digits for emailed sign-in codes. */
export function randomDigits(n = 6): string {
  return Array.from({ length: n }, () => randomInt(10)).join('');
}

/** Tokens are high-entropy, so a plain SHA-256 is enough to store them. */
export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

/** Low-entropy secrets (6-digit codes) are keyed with AUTH_SECRET so a DB leak can't brute-force them offline. */
export function keyedHash(value: string): string {
  return createHmac('sha256', getEnv().AUTH_SECRET).update(value).digest('hex');
}

export function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export function normaliseEmail(email: string): string {
  return email.trim().toLowerCase();
}

export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
