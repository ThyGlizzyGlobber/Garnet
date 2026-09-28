import { NextResponse } from 'next/server';
import { handleInboundEmail, INBOUND_MAX_BYTES } from '@/ingest/inbound';

export const dynamic = 'force-dynamic';

/**
 * Delivery endpoint for the Cloudflare Email Worker (deploy/email-worker).
 * Body: the raw RFC 822 message. Headers: X-Inbound-To (envelope recipient),
 * X-Timestamp and X-Signature (HMAC-SHA256 with INBOUND_EMAIL_SECRET).
 * 404 tells the Worker to reject the message as an unknown address.
 */
export async function POST(req: Request) {
  const length = Number(req.headers.get('content-length') ?? 0);
  if (length > INBOUND_MAX_BYTES) return NextResponse.json({ error: 'too large' }, { status: 413 });
  const body = Buffer.from(await req.arrayBuffer());
  const result = await handleInboundEmail({ headers: req.headers, body });
  return NextResponse.json(result.body, { status: result.status });
}
