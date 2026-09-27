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

/** Trusted entries match the domain itself and its subdomains. */
export function isTrustedSender(domain: string | null, trusted: string[]): boolean {
  if (!domain) return false;
  const d = domain.toLowerCase();
  return trusted.some((t) => {
    const x = t.trim().toLowerCase().replace(/^@/, '');
    return !!x && (d === x || d.endsWith(`.${x}`));
  });
}

/** Tidy a typed list ("AussieBroadband.com.au, @agl.com.au") into domains. */
export function parseSenderList(input: string): string[] {
  return [
    ...new Set(
      input
        .split(/[\s,;]+/)
        .map((s) => s.trim().toLowerCase().replace(/^@/, ''))
        .filter((s) => /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(s)),
    ),
  ];
}
