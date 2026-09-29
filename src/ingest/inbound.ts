import fs from 'node:fs';
import path from 'node:path';
import { getDb, type Db } from '@/db/client';
import { aliasFromRecipient, householdByAlias, verifyDelivery } from '@/lib/bills-address';
import type { DNSResolver } from 'mailauth';
import { checkSender } from '@/lib/sender-auth';
import { getEnv, isInboundEmailConfigured } from '@/lib/env';
import { ensureDataDirs } from '@/lib/paths';
import { rateLimit } from '@/lib/rate-limit';
import { archiveEmail } from './email';
import { processDocument } from './pipeline';

/** Cloudflare Email Routing accepts messages up to 25 MiB. */
export const INBOUND_MAX_BYTES = 26 * 1024 * 1024;

export interface InboundResult {
  status: 202 | 400 | 401 | 404 | 413 | 429 | 503;
  body: Record<string, unknown>;
}

/**
 * One message from the Cloudflare Email Worker. The raw email is archived
 * before answering (so it's never lost), then read in the background: AI
 * extraction can take longer than the Worker should wait.
 */
export async function handleInboundEmail(
  req: { headers: Headers; body: Buffer },
  opts: {
    db?: Db;
    nowS?: number;
    waitForProcessing?: boolean;
    /** DNS lookups for DKIM keys (tests). */
    resolver?: DNSResolver;
  } = {},
): Promise<InboundResult> {
  const env = getEnv();
  const db = opts.db ?? getDb();
  if (!isInboundEmailConfigured(env))
    return { status: 503, body: { error: 'inbound email is off' } };
  if (req.body.length > INBOUND_MAX_BYTES) return { status: 413, body: { error: 'too large' } };
  const recipient = req.headers.get('x-inbound-to') ?? '';
  const signed = verifyDelivery(
    env.INBOUND_EMAIL_SECRET!,
    {
      timestamp: req.headers.get('x-timestamp'),
      signature: req.headers.get('x-signature'),
      recipient,
    },
    req.body,
    opts.nowS,
  );
  if (!signed) return { status: 401, body: { error: 'bad signature' } };
  // Once the Worker signs the recipient too, the older signature is refused for good.
  if (signed === 'v1' && householdBoundSince())
    return { status: 401, body: { error: 'signature version retired' } };
  if (signed === 'v2' && !householdBoundSince()) recordHouseholdBound();
  const alias = aliasFromRecipient(recipient, env);
  const hh = alias ? householdByAlias(alias, db) : null;
  if (!hh) return { status: 404, body: { error: 'unknown address' } };
  if (!rateLimit(`inbound:${hh.id}`, env.INBOUND_MAX_PER_HOUR, 3_600_000))
    return { status: 429, body: { error: 'too many messages' } };
  if (req.body.length === 0) return { status: 400, body: { error: 'empty message' } };

  const receivedAt = new Date((opts.nowS ?? Date.now() / 1000) * 1000).toISOString();
  const sender = await checkSender(req.body, { resolver: opts.resolver });
  const { archived, toProcess } = await archiveEmail(hh.id, req.body, receivedAt, db, {
    domain: sender.fromDomain,
    verified: sender.verified,
  });
  const work = (async () => {
    for (const id of toProcess) {
      try {
        await processDocument(hh.id, id, db);
      } catch (e) {
        console.error(`[inbound] processing ${id} failed:`, (e as Error).message);
      }
    }
  })();
  if (opts.waitForProcessing) await work;
  console.log(`[inbound] ${hh.id}: archived ${archived}, reading ${toProcess.length}`);
  return { status: 202, body: { archived, reading: toProcess.length } };
}

// ─── Signature version ──────────────────────────────────────────────────────

const SIGNATURE_FILE = 'inbound-signature.json';

/**
 * When the first delivery signed with the recipient (v2) arrived, or null while
 * the Worker still sends the older signature. Recorded in the data directory
 * so it survives restarts and updates.
 */
export function householdBoundSince(): string | null {
  try {
    const f = path.join(ensureDataDirs().config, SIGNATURE_FILE);
    return (JSON.parse(fs.readFileSync(f, 'utf8')) as { v2Since?: string }).v2Since ?? null;
  } catch {
    return null;
  }
}

function recordHouseholdBound(): void {
  fs.writeFileSync(
    path.join(ensureDataDirs().config, SIGNATURE_FILE),
    JSON.stringify({ v2Since: new Date().toISOString() }, null, 2),
  );
}
