/**
 * Cloudflare Email Worker for Garnet household bills addresses.
 *
 * Email Routing hands every message for the bills addresses to this Worker.
 * It signs the recipient and the raw message together and posts them to the
 * app, which works out which household it belongs to from the recipient (the
 * signature covers it, so a delivery can't be replayed to another household).
 *
 * Variables (Worker → Settings → Variables and Secrets):
 *   APP_INBOUND_URL      https://<your app>/api/inbound/email
 *   INBOUND_EMAIL_SECRET same value as the app's INBOUND_EMAIL_SECRET (secret)
 *   FALLBACK_TO          optional, a verified Email Routing destination: gets a
 *                        copy when the app can't be reached, so no bill is lost
 *   FORWARD_OTHER_TO     optional, a verified destination for mail to addresses
 *                        that aren't household bills addresses (catch-all setups)
 */
const worker = {
  async email(message, env) {
    const raw = new Uint8Array(await new Response(message.raw).arrayBuffer());
    let res;
    try {
      const timestamp = String(Math.floor(Date.now() / 1000));
      res = await fetch(env.APP_INBOUND_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'message/rfc822',
          'X-Inbound-To': message.to,
          'X-Inbound-From': message.from,
          'X-Timestamp': timestamp,
          'X-Signature': await sign(env.INBOUND_EMAIL_SECRET, timestamp, message.to, raw),
        },
        body: raw,
      });
    } catch (e) {
      res = { status: 0, error: e };
    }
    if (res.status === 202) return;
    if (res.status === 404) {
      if (env.FORWARD_OTHER_TO) return message.forward(env.FORWARD_OTHER_TO);
      return message.setReject('Unknown address');
    }
    // App unreachable, rate-limited or misconfigured: keep the bill somewhere.
    if (env.FALLBACK_TO) return message.forward(env.FALLBACK_TO);
    throw new Error(`Garnet answered ${res.status}`);
  },
};

export default worker;

/** "v2=" + hex HMAC-SHA256 over "v2.<timestamp>.<recipient>." followed by the raw message. */
export async function sign(secret, timestamp, recipient, raw) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const prefix = enc.encode(`v2.${timestamp}.${recipient}.`);
  const data = new Uint8Array(prefix.length + raw.length);
  data.set(prefix);
  data.set(raw, prefix.length);
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, data));
  return `v2=${Array.from(mac, (b) => b.toString(16).padStart(2, '0')).join('')}`;
}
