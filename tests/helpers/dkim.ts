import { generateKeyPairSync } from 'node:crypto';
import { dkimSign, type DNSResolver } from 'mailauth';

/**
 * A throwaway DKIM key for a domain, plus a DNS resolver that serves its public
 * key, so tests can produce genuinely signed mail without the network.
 */
export function dkimKeys(domains: string[], selector = 's1') {
  const keys = new Map(
    domains.map((d) => [d, generateKeyPairSync('rsa', { modulusLength: 2048 })] as const),
  );
  const resolver: DNSResolver = async (name, rrtype) => {
    for (const [domain, pair] of keys) {
      if (rrtype === 'TXT' && name === `${selector}._domainkey.${domain}`) {
        const p = pair.publicKey.export({ type: 'spki', format: 'der' }).toString('base64');
        return [[`v=DKIM1; k=rsa; p=${p}`]];
      }
    }
    const err = new Error(`no ${rrtype} for ${name}`) as Error & { code: string };
    err.code = 'ENOTFOUND';
    throw err;
  };
  async function sign(raw: Buffer, domain: string): Promise<Buffer> {
    const pair = keys.get(domain);
    if (!pair) throw new Error(`no key for ${domain}`);
    const privateKey = pair.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
    // mailauth 7 signs from `signatureData`; its bundled types only describe the
    // older top-level form, which now silently produces no signature.
    const options = {
      canonicalization: 'relaxed/relaxed',
      signatureData: [{ signingDomain: domain, selector, privateKey }],
    } as unknown as Parameters<typeof dkimSign>[1];
    const res = await dkimSign(raw, options);
    if (!res.signatures) throw new Error('mailauth produced no DKIM signature');
    if (res.errors.length) throw new Error(JSON.stringify(res.errors));
    return Buffer.concat([Buffer.from(res.signatures), raw]);
  }
  return { resolver, sign };
}
