/**
 * In-memory fixed-window rate limiter. The app is a single process, so memory
 * is the right place; limits reset on restart, which is acceptable for the alpha.
 */
const buckets = new Map<string, { count: number; resetAt: number }>();

/** Returns true when the action is allowed, and counts it. */
export function rateLimit(key: string, limit: number, windowMs: number, now = Date.now()): boolean {
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
