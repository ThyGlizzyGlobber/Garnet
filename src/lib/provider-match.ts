/**
 * Does an email domain plausibly belong to a provider? Used to trust a signed
 * sender on its very first bill without asking anyone: aussiebroadband.com.au
 * for "Aussie Broadband", agl.com.au for "AGL", yvw.com.au for "Yarra Valley
 * Water". A stranger's domain won't look like the provider's name.
 */

/** Generic labels that carry no identity. */
const GENERIC = new Set([
  'mail',
  'email',
  'e',
  'em',
  'mailer',
  'news',
  'newsletter',
  'billing',
  'bills',
  'accounts',
  'account',
  'noreply',
  'no-reply',
  'notify',
  'notifications',
  'info',
  'service',
  'services',
  'my',
  'online',
  'www',
  'mx',
  'send',
  'bounce',
  'mg',
  'sg',
  'r',
  'go',
]);
/** Common second-level and top-level parts. */
const SUFFIX = new Set([
  'com',
  'net',
  'org',
  'gov',
  'edu',
  'co',
  'asn',
  'id',
  'au',
  'nz',
  'uk',
  'us',
  'ca',
  'io',
  'info',
  'biz',
  'app',
]);
/** Words providers add that shouldn't decide the match. */
const FILLER = new Set(['pty', 'ltd', 'limited', 'the', 'and', 'of', 'australia', 'group']);

function words(provider: string): string[] {
  return provider
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[̀-ͯ]/g, '')
    .split(/[^a-z0-9]+/)
    .filter((w) => w && !FILLER.has(w));
}

/** The identifying labels of a domain: "mail.aussiebroadband.com.au" → ["aussiebroadband"]. */
function identity(domain: string): string[] {
  return domain
    .toLowerCase()
    .split('.')
    .filter((l) => l && !SUFFIX.has(l) && !GENERIC.has(l));
}

/** Industry words that name no one in particular ("broadband.com.au" is not Aussie Broadband). */
const GENERIC_WORDS = new Set([
  'energy',
  'water',
  'power',
  'gas',
  'electricity',
  'electric',
  'broadband',
  'internet',
  'mobile',
  'telecom',
  'telco',
  'utilities',
  'utility',
  'networks',
  'network',
  'solar',
  'home',
  'bills',
  'billing',
  'retail',
  'services',
  'phone',
  'insurance',
  'health',
  'council',
  'city',
  'shire',
  'rates',
]);

/**
 * Exact matches only — no prefixes, so "aussie-broadband-billing.xyz" never
 * passes for Aussie Broadband: the whole name run together, its initials, or
 * its first word when that word is distinctive.
 */
export function senderMatchesProvider(domain: string | null, provider: string): boolean {
  if (!domain) return false;
  const w = words(provider);
  if (!w.length) return false;
  const compact = w.join('');
  const acronym = w.length >= 3 ? w.map((x) => x[0]).join('') : null;
  const first = w[0]!;
  return identity(domain).some((label) => {
    const l = label.replace(/-/g, '');
    if (l.length < 2) return false;
    if (l === compact || l === acronym) return true;
    return l === first && first.length >= 4 && !GENERIC_WORDS.has(first);
  });
}
