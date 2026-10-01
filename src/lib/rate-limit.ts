/**
 * In-memory fixed-window rate limiter. The app is a single process, so memory
 * is the right place; limits reset on restart, which is acceptable for the alpha.
 */
const buckets = new Map<string, { count: number; resetAt: number }>();

/** Returns true when the action is allowed, and counts it. */
export function rateLimit(key: string, limit: number, windowMs: number, now = Date.now()): boolean {
  if (buckets.size > 10_000) for (const [k, v] of buckets) if (v.resetAt <= now) buckets.delete(k);
  const b = buckets.get(key);
  if (!b || b.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (b.count >= limit) return false;
  b.count++;
  return true;
}

/** Test helper. */
export function resetRateLimits(): void {
  buckets.clear();
}

/** Per-network limits for sign-in steps (the per-account and per-address limits sit on top). */
export const IP_LIMITS = {
  sendCode: { limit: 20, windowMs: 3_600_000 },
  verifyCode: { limit: 30, windowMs: 3_600_000 },
  joinCode: { limit: 20, windowMs: 3_600_000 },
  demoLogin: { limit: 20, windowMs: 3_600_000 },
  claim: { limit: 10, windowMs: 3_600_000 },
  unlock: { limit: 30, windowMs: 3_600_000 },
  googleStart: { limit: 30, windowMs: 3_600_000 },
  requestAccess: { limit: 10, windowMs: 3_600_000 },
} as const;

export function ipAllowed(kind: keyof typeof IP_LIMITS, ip: string, now = Date.now()): boolean {
  const { limit, windowMs } = IP_LIMITS[kind];
  return rateLimit(`ip:${kind}:${ip}`, limit, windowMs, now);
}
