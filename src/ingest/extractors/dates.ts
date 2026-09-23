/** Date parsing for bill text. Returns YYYY-MM-DD or null. */

const MONTHS: Record<string, number> = {
  jan: 1,
  january: 1,
  feb: 2,
  february: 2,
  mar: 3,
  march: 3,
  apr: 4,
  april: 4,
  may: 5,
  jun: 6,
  june: 6,
  jul: 7,
  july: 7,
  aug: 8,
  august: 8,
  sep: 9,
  sept: 9,
  september: 9,
  oct: 10,
  october: 10,
  nov: 11,
  november: 11,
  dec: 12,
  december: 12,
};

function iso(y: number, m: number, d: number): string | null {
  if (m < 1 || m > 12 || d < 1 || d > 31 || y < 1990 || y > 2100) return null;
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCMonth() !== m - 1) return null;
  return date.toISOString().slice(0, 10);
}

/** True for locales that write month before day (en-US and a few others). */
export function monthFirst(locale: string): boolean {
  const parts = new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'numeric',
    year: 'numeric',
  }).formatToParts(new Date(Date.UTC(2000, 10, 25)));
  const order = parts.filter((p) => p.type === 'day' || p.type === 'month').map((p) => p.type);
  return order[0] === 'month';
}

/**
 * Parse "14 Jun 2026", "June 14, 2026", "2026-06-14", "14/06/2026" (locale decides
 * day/month order for the numeric form; unambiguous values override the locale).
 */
export function parseDate(raw: string | null | undefined, locale = 'en-AU'): string | null {
  if (!raw) return null;
  const s = raw.trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return iso(+m[1]!, +m[2]!, +m[3]!);
  m = s.match(/^(\d{1,2})\s+([A-Za-z]{3,9})\.?,?\s+(\d{4})/);
  if (m) {
    const mon = MONTHS[m[2]!.toLowerCase()];
    return mon ? iso(+m[3]!, mon, +m[1]!) : null;
  }
  m = s.match(/^([A-Za-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{4})/);
  if (m) {
    const mon = MONTHS[m[1]!.toLowerCase()];
    return mon ? iso(+m[3]!, mon, +m[2]!) : null;
  }
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/);
  if (m) {
    const a = +m[1]!;
    const b = +m[2]!;
    const y = m[3]!.length === 2 ? 2000 + +m[3]! : +m[3]!;
    if (a > 12 && b <= 12) return iso(y, b, a);
    if (b > 12 && a <= 12) return iso(y, a, b);
    return monthFirst(locale) ? iso(y, a, b) : iso(y, b, a);
  }
  return null;
}

/** "$129.00" / "1,234.56" / "€12,50" → minor units, using the currency's digit count. */
export function parseAmount(raw: string | null | undefined, digits = 2): number | null {
  if (!raw) return null;
  const cleaned = raw.replace(/[^\d.,-]/g, '');
  if (!cleaned) return null;
  const lastComma = cleaned.lastIndexOf(',');
  const lastDot = cleaned.lastIndexOf('.');
  let normalised = cleaned;
  if (lastComma > -1 && lastDot > -1)
    normalised =
      lastComma > lastDot
        ? cleaned.replace(/\./g, '').replace(',', '.')
        : cleaned.replace(/,/g, '');
  else if (lastComma > -1)
    normalised =
      cleaned.length - lastComma - 1 <= 2 ? cleaned.replace(',', '.') : cleaned.replace(/,/g, '');
  const n = Number(normalised);
  return Number.isFinite(n) ? Math.round(n * 10 ** digits) : null;
}
