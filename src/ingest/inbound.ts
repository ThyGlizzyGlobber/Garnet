import { getDb, type Db } from '@/db/client';
import {
  aliasFromRecipient,
  billsAddress,
  householdByAlias,
  verifyDelivery,
} from '@/lib/bills-address';
import { forwardInbound } from '@/lib/forwarding';
import { getEnv, isInboundEmailConfigured } from '@/lib/env';
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
    /** Banner on forwarded copies (translated by the route). */
    forwardBanner?: (sender: string, address: string) => string;
  } = {},
): Promise<InboundResult> {
  const env = getEnv();
  const db = opts.db ?? getDb();
  if (!isInboundEmailConfigured(env))
    return { status: 503, body: { error: 'inbound email is off' } };
  if (req.body.length > INBOUND_MAX_BYTES) return { status: 413, body: { error: 'too large' } };
  const signed = verifyDelivery(
    env.INBOUND_EMAIL_SECRET!,
    { timestamp: req.headers.get('x-timestamp'), signature: req.headers.get('x-signature') },
    req.body,
    opts.nowS,
  );
  if (!signed) return { status: 401, body: { error: 'bad signature' } };
  const alias = aliasFromRecipient(req.headers.get('x-inbound-to') ?? '', env);
  const hh = alias ? householdByAlias(alias, db) : null;
  if (!hh) return { status: 404, body: { error: 'unknown address' } };
  if (!rateLimit(`inbound:${hh.id}`, env.INBOUND_MAX_PER_HOUR, 3_600_000))
    return { status: 429, body: { error: 'too many messages' } };
  if (req.body.length === 0) return { status: 400, body: { error: 'empty message' } };

  const receivedAt = new Date((opts.nowS ?? Date.now() / 1000) * 1000).toISOString();
  const { archived, toProcess } = await archiveEmail(hh.id, req.body, receivedAt, db);
  const address = billsAddress(hh, db) ?? '';
  const banner =
    opts.forwardBanner ??
    ((sender: string, to: string) =>
      `Forwarded from your household's bills address ${to}. Sent by ${sender}.`);
  const work = (async () => {
    let readAsBill = false;
    for (const id of toProcess) {
      try {
        const outcome = await processDocument(hh.id, id, db);
        if (outcome.status === 'extracted' || outcome.reason === 'duplicate') readAsBill = true;
      } catch (e) {
        console.error(`[inbound] processing ${id} failed:`, (e as Error).message);
      }
    }
    // Copies go out once per new message, after reading so "only non-bills" can decide.
    if (archived > 0) {
      try {
        await forwardInbound(hh.id, req.body, {
          billsAddress: address,
          readAsBill,
          banner: (sender) => banner(sender, address),
          db,
        });
      } catch (e) {
        console.error('[inbound] forwarding failed:', (e as Error).message);
      }
    }
  })();
  if (opts.waitForProcessing) await work;
  console.log(`[inbound] ${hh.id}: archived ${archived}, reading ${toProcess.length}`);
  return { status: 202, body: { archived, reading: toProcess.length } };
}
