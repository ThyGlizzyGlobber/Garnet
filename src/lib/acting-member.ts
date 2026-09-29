import { getDb, type Db } from '@/db/client';
import type { SourceDocument } from '@/db/schema';
import { memberByAddress } from '@/lib/accounts';
import { addressOf } from '@/lib/sender-auth';

/**
 * The member a document came from: whoever uploaded it, or the member whose
 * address a signed forward came from. Null for mail straight from a provider.
 */
export function actingMember(
  householdId: string,
  doc: Partial<SourceDocument>,
  db: Db = getDb(),
): string | null {
  if (doc.memberId) return doc.memberId;
  if (!doc.senderVerified) return null;
  const address = addressOf(doc.emailFrom ?? null);
  return address ? memberByAddress(householdId, address, db) : null;
}
