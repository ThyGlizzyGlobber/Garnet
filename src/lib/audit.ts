import { desc } from 'drizzle-orm';
import { getDb, type Db } from '@/db/client';
import { auditLog, type AuditLog } from '@/db/schema';
import { ulid } from '@/lib/ids';

/**
 * The audit log (SCOPE-console.md §3f, C-D9): every action a developer takes
 * on the install, kept for good. One function writes it; the console's
 * actions, software updates and the service-type catalog call it. Nothing in
 * the app deletes a line. Members never see it: it is about developers.
 */
export interface AuditEntry {
  /** The developer's account id and email (null for a startup step). */
  accountId: string | null;
  email: string | null;
  /** A short verb phrase key: "early-access.on", "allow.add", "household.cap"… */
  action: string;
  targetKind?: 'household' | 'account' | 'request' | 'email' | 'install' | 'service-type';
  targetId?: string | null;
  /** A name to show (the household's, the address), never a bill. */
  targetName?: string | null;
  /** Small facts about the change (the new cap, how many added). */
  detail?: Record<string, string | number | boolean | null>;
  ip?: string | null;
}

export function audit(entry: AuditEntry, db: Db = getDb()): AuditLog {
  const row: AuditLog = {
    id: ulid(),
    at: new Date().toISOString(),
    accountId: entry.accountId,
    email: entry.email,
    action: entry.action,
    targetKind: entry.targetKind ?? null,
    targetId: entry.targetId ?? null,
    targetName: entry.targetName ?? null,
    detail: entry.detail ?? null,
    ip: entry.ip ?? null,
  };
  db.insert(auditLog).values(row).run();
  return row;
}

/** Newest first, a page at a time. */
export function auditLines(
  db: Db = getDb(),
  opts: { limit?: number; offset?: number } = {},
): AuditLog[] {
  return db
    .select()
    .from(auditLog)
    .orderBy(desc(auditLog.at))
    .limit(opts.limit ?? 100)
    .offset(opts.offset ?? 0)
    .all();
}
