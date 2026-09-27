import { dkimVerify, type DNSResolver } from 'mailauth';

/**
 * Is an email really from the domain in its From address? Cloudflare Email
 * Routing doesn't pass its SPF/DKIM/DMARC verdicts to Workers (workerd #6740),
 * so the app verifies DKIM itself: a passing signature whose signing domain is
 * aligned (same organisational domain) with the From domain. SPF can't be
 * checked here — the connecting IP never reaches the app.
 */
export interface SenderCheck {
  /** Lower-cased domain of the (single) From address, or null. */
  fromDomain: string | null;
  verified: boolean;
}

function domainOf(address: string | undefined): string | null {
  const m = /@([^@\s>]+)>?\s*$/.exec(address ?? '');
  return m ? m[1]!.toLowerCase() : null;
}

export async function checkSender(
  raw: Buffer,
  opts: { resolver?: DNSResolver } = {},
): Promise<SenderCheck> {
  try {
    const r = await dkimVerify(raw, opts.resolver ? { resolver: opts.resolver } : {});
    const froms = Array.isArray(r.headerFrom) ? r.headerFrom : [r.headerFrom];
    // More than one From address is a classic spoofing trick: never verified.
    const fromDomain = froms.length === 1 ? domainOf(froms[0]) : null;
    const verified =
      !!fromDomain && r.results.some((x) => x.status?.result === 'pass' && !!x.status?.aligned);
    return { fromDomain, verified };
  } catch {
    return { fromDomain: null, verified: false };
  }
}

/**
 * Personal mailbox providers: anyone can have an address there, so the domain
 * as a whole is never a trustworthy bill sender — only an exact address is.
 */
const FREEMAIL = new Set([
  'gmail.com',
  'googlemail.com',
  'outlook.com',
  'hotmail.com',
  'live.com',
  'msn.com',
  'outlook.com.au',
  'hotmail.com.au',
  'live.com.au',
  'yahoo.com',
  'yahoo.com.au',
  'ymail.com',
  'icloud.com',
  'me.com',
  'mac.com',
  'aol.com',
  'proton.me',
  'protonmail.com',
  'pm.me',
  'gmx.com',
  'gmx.net',
  'mail.com',
  'zoho.com',
  'fastmail.com',
  'hey.com',
  'bigpond.com',
  'bigpond.net.au',
  'optusnet.com.au',
  'iinet.net.au',
  'internode.on.net',
  'tpg.com.au',
  'westnet.com.au',
  'dodo.com.au',
  'adam.com.au',
  'aapt.net.au',
  'xtra.co.nz',
  'btinternet.com',
  'sky.com',
  'qq.com',
]);

export function isFreemail(domain: string | null): boolean {
  if (!domain) return false;
  const d = domain.toLowerCase();
  return [...FREEMAIL].some((f) => d === f || d.endsWith(`.${f}`));
}

/** The bare address from a From header ("Name <a@b.com>" → "a@b.com"). */
export function addressOf(from: string | null | undefined): string | null {
  const m =
    /<([^<>\s]+@[^<>\s]+)>/.exec(from ?? '') ?? /([^\s<>,;"]+@[^\s<>,;"]+)/.exec(from ?? '');
  return m ? m[1]!.toLowerCase() : null;
}

/**
 * Trusted entries are domains (matching themselves and subdomains; never a
 * personal-mailbox domain) or exact addresses (for bills forwarded from a
 * particular Gmail/Outlook/… account).
 */
export function isTrustedSender(
  domain: string | null,
  trusted: string[],
  address?: string | null,
): boolean {
  const d = domain?.toLowerCase() ?? null;
  const a = address?.toLowerCase() ?? null;
  return trusted.some((t) => {
    const x = t.trim().toLowerCase().replace(/^@/, '');
    if (!x) return false;
    if (x.includes('@')) return !!a && a === x;
    if (!d || isFreemail(x)) return false;
    return d === x || d.endsWith(`.${x}`);
  });
}

/** What to offer trusting after a verified bill: the domain, or the exact address for personal mailboxes. */
export function trustTarget(domain: string | null, address: string | null): string | null {
  if (!domain) return null;
  if (isFreemail(domain)) return address;
  return domain;
}

/** Tidy a typed list ("AussieBroadband.com.au, @agl.com.au, me@gmail.com") into entries. */
export function parseSenderList(input: string): string[] {
  return [
    ...new Set(
      input
        .split(/[\s,;]+/)
        .map((s) => s.trim().toLowerCase().replace(/^@/, ''))
        .filter(
          (s) =>
            /^[^@\s]+@[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(s) ||
            (/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(s) && !isFreemail(s)),
        ),
    ),
  ];
}
