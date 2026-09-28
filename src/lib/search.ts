/**
 * Plain-language search used by the Bills page and the Inbox: every word typed
 * must appear somewhere in what we know about an item. Numbers match amounts
 * ("129", "$129.00"), and month names and years match the bill's month.
 */

/** Words to look for: lower case; currency signs and thousands separators dropped. */
export function searchTokens(query: string): string[] {
  return query
    .toLowerCase()
    .split(/\s+/)
    .map((w) => w.replace(/^[#$€£¥]+/, '').replace(/(\d),(\d)/g, '$1$2'))
    .filter((w) => w.length > 0)
    .slice(0, 8);
}

/** True when every token appears in the haystack (already lower case). */
export function matchesAll(haystack: string, tokens: string[]): boolean {
  return tokens.every((t) => haystack.includes(t));
}

/** Every way a month might be typed: "august", "aug", "2026", "08/2026", "2026-08". */
export function monthWords(month: string, locale: string): string[] {
  const d = new Date(`${month}-01T00:00:00Z`);
  const f = (o: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat(locale, { ...o, timeZone: 'UTC' }).format(d).toLowerCase();
  const [y, m] = month.split('-');
  return [f({ month: 'long' }), f({ month: 'short' }), y!, `${m}/${y}`, month];
}

/** An amount as it might be typed: "129.00", "129", "1234.50", "1,234.50". */
export function amountWords(minor: number, digits: number): string[] {
  const major = minor / 10 ** digits;
  const fixed = major.toFixed(digits);
  const words = [fixed, fixed.replace(/\B(?=(\d{3})+(?!\d))/g, ',')];
  if (Number.isInteger(major)) words.push(String(major));
  return words;
}
