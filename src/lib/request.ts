import { headers } from 'next/headers';

/**
 * The browser reached us over HTTPS. Behind the Cloudflare Tunnel, cloudflared
 * sets X-Forwarded-Proto; on the LAN (the wall iPad) requests are plain http.
 * A LAN client faking the header only makes its own cookies Secure, which just
 * stops them working for itself.
 */
export async function requestIsHttps(): Promise<boolean> {
  const proto = (await headers()).get('x-forwarded-proto')?.split(',')[0]?.trim();
  return proto === 'https';
}

/** Best-effort client address for rate limits: Cloudflare's header, then the proxy chain. */
export async function clientIp(): Promise<string> {
  const h = await headers();
  return (
    h.get('cf-connecting-ip') ??
    h.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    h.get('x-real-ip') ??
    'unknown'
  );
}

/** A same-site path that's safe to redirect to after signing in ("/bills?x=1"), else null. */
export function safeNext(next: string | null | undefined): string | null {
  if (!next || !next.startsWith('/') || next.startsWith('//') || /[\\\s]/.test(next)) return null;
  try {
    const u = new URL(next, 'http://same.invalid');
    return u.origin === 'http://same.invalid' ? `${u.pathname}${u.search}${u.hash}` : null;
  } catch {
    return null;
  }
}

/**
 * A request body, read no further than `max` bytes. Null when it's larger, so
 * a caller that hasn't authenticated the sender yet never holds more than that
 * (Content-Length can be left out).
 */
export async function readBodyCapped(req: Request, max: number): Promise<Buffer | null> {
  if (Number(req.headers.get('content-length') ?? 0) > max) return null;
  if (!req.body) return Buffer.alloc(0);
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

/**
 * A Content-Disposition value that survives any file name: an ASCII fallback
 * plus the UTF-8 name (RFC 6266). Node rejects header values outside Latin-1,
 * so an en dash or emoji in a name must never go in raw.
 */
export function contentDisposition(type: 'inline' | 'attachment', filename: string): string {
  const ascii = filename.replace(/[^\x20-\x7e]/gu, '_').replace(/["\\]/g, '');
  const utf8 = encodeURIComponent(filename).replace(
    /['()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `${type}; filename="${ascii}"; filename*=UTF-8''${utf8}`;
}
