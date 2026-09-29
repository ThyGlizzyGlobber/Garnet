import { eq } from 'drizzle-orm';
import { getDb, type Db } from '@/db/client';
import { account, type SourceDocument } from '@/db/schema';
import { listMembers } from '@/lib/members';
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
  if (!address) return null;
  return (
    listMembers(householdId, db).find(
      (m) => m.email?.toLowerCase() === address || memberAccountEmail(m.accountId, db) === address,
    )?.id ?? null
  );
}

function memberAccountEmail(accountId: string | null, db: Db): string | null {
  if (!accountId) return null;
  return (
    db.select({ email: account.email }).from(account).where(eq(account.id, accountId)).get()
      ?.email ?? null
  );
}
