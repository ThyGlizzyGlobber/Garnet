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
