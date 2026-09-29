import type { Db } from '@/db/client';
import type { SourceDocument } from '@/db/schema';
import { householdEmails } from '@/lib/accounts';
import { actingMember } from '@/lib/acting-member';
import { senderMatchesProvider } from '@/lib/provider-match';
import type { Scope } from '@/lib/scope';
import { addressOf, isFreemail, isTrustedSender } from '@/lib/sender-auth';

/**
 * Who a document speaks for. Mail to a household's bills address can come
 * from anyone who learns the address, so every step that changes bills asks:
 *   household  brought in by the household (an upload, "It's a bill", the
 *              operator's mailbox): may act for any of its services
 *   member     signed mail from a member's own address: likewise
 *   signed     signed mail from anyone else: only for services that trust the
 *              sender (on their list, or plainly the provider's own domain)
 *   unsigned   mail that can't be proven to come from its sender: never acts
 */
export type Standing = 'household' | 'member' | 'signed' | 'unsigned';

export function standingOf(
  householdId: string,
  doc: Pick<SourceDocument, 'senderVerified' | 'emailFrom'>,
  db: Db,
): Standing {
  if (doc.senderVerified === null) return 'household';
  if (!doc.senderVerified) return 'unsigned';
  const address = addressOf(doc.emailFrom);
  return address && householdEmails(householdId, db).has(address) ? 'member' : 'signed';
}

/** The signed sender's domain is plainly the provider's own (agl.com.au for AGL), never a mailbox provider's. */
export function isProvidersDomain(
  doc: Pick<SourceDocument, 'senderDomain'>,
  provider: string,
): boolean {
  return !isFreemail(doc.senderDomain) && senderMatchesProvider(doc.senderDomain, provider);
}

/** Does this service trust the document's (signed) sender? */
export function trustsSender(
  doc: Pick<SourceDocument, 'senderDomain' | 'emailFrom'>,
  svc: { provider: string; trustedSenders: string[] },
): boolean {
  return (
    isTrustedSender(doc.senderDomain, svc.trustedSenders, addressOf(doc.emailFrom)) ||
    isProvidersDomain(doc, svc.provider)
  );
}

/** May this document change the household's bills for a service? */
export function mayActFor(
  householdId: string,
  doc: Pick<SourceDocument, 'senderVerified' | 'emailFrom' | 'senderDomain'>,
  svc: { provider: string; trustedSenders: string[] },
  db: Db,
): boolean {
  const standing = standingOf(householdId, doc, db);
  return (
    standing === 'household' ||
    standing === 'member' ||
    (standing === 'signed' && trustsSender(doc, svc))
  );
}

/**
 * The services a document may land on: the household's, plus the personal
 * ones of the member it came from. Mail straight from a provider may reach any
 * member's personal service (the trust rules still decide whether it acts).
 */
export function documentScope(householdId: string, doc: Partial<SourceDocument>, db: Db): Scope {
  const member = actingMember(householdId, doc, db);
  return member ? { viewer: member } : { everyone: true };
}
