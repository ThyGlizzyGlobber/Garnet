/**
 * Locale-aware formatting. Money is always integer minor units + ISO 4217 code.
 * Never hand-format currency or dates; go through these helpers.
 */

/** Number of minor-unit digits for a currency (2 for most, 0 for JPY/KRW, 3 for KWD/BHD...). */
export function minorUnitDigits(currency: string): number {
  try {
    return (
      new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions()
        .maximumFractionDigits ?? 2
    );
  } catch {
    return 2;
  }
}

/**
 * Minor units as a plain major-unit number string for machine-readable output
 * (CSV): no symbol, no grouping, '.' decimal, digits from the currency.
 * 12900 AUD → "129.00", 1290 JPY → "1290", 1234 KWD → "1.234".
 */
export function formatMinorPlain(minor: number, currency: string): string {
  const digits = minorUnitDigits(currency);
  const sign = minor < 0 ? '-' : '';
  const abs = Math.abs(Math.round(minor));
  if (digits === 0) return `${sign}${abs}`;
  const scale = 10 ** digits;
  const whole = Math.floor(abs / scale);
  const frac = String(abs % scale).padStart(digits, '0');
  return `${sign}${whole}.${frac}`;
}

/** Minor units as a major-unit number (12900 AUD → 129), for charts and scales. */
export function toMajor(minor: number, currency: string): number {
  return minor / 10 ** minorUnitDigits(currency);
}

/**
 * Convert minor units (e.g. cents) to a display string in the given locale.
 * `whole` drops the minor units ("$129") for tight spaces; `compact` gives "$1.2K".
 */
export function formatMoney(
  minor: number,
  currency: string,
  locale: string,
  opts: { compact?: boolean; whole?: boolean } = {},
): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    ...(opts.whole ? { maximumFractionDigits: 0, minimumFractionDigits: 0 } : {}),
    ...(opts.compact ? { notation: 'compact', maximumFractionDigits: 1 } : {}),
  }).format(toMajor(minor, currency));
}

/**
 * A money figure in pieces, so the cents can be set smaller: the part before
 * the decimal mark, the mark with the minor units, and anything after (a
 * currency sign that follows the number in some locales).
 */
export function formatMoneyParts(
  minor: number,
  currency: string,
  locale: string,
): { main: string; minor: string; tail: string } {
  const parts = new Intl.NumberFormat(locale, { style: 'currency', currency }).formatToParts(
    toMajor(minor, currency),
  );
  const at = parts.findIndex((p) => p.type === 'decimal');
  if (at < 0) return { main: parts.map((p) => p.value).join(''), minor: '', tail: '' };
  const end = at + 2;
  const join = (list: Intl.NumberFormatPart[]) => list.map((p) => p.value).join('');
  return {
    main: join(parts.slice(0, at)),
    minor: join(parts.slice(at, end)),
    tail: join(parts.slice(end)),
  };
}

/** Parse a user-typed major-unit amount ("129.00", "1,234.50", "€12,50") into minor units. */
export function parseMoneyToMinor(input: string, currency: string): number | null {
  const digits = minorUnitDigits(currency);
  const cleaned = input.replace(/[^\d.,-]/g, '');
  if (!cleaned) return null;
  // If both separators exist, the last one is the decimal separator.
  const lastComma = cleaned.lastIndexOf(',');
  const lastDot = cleaned.lastIndexOf('.');
  let normalized: string;
  if (lastComma > -1 && lastDot > -1) {
    normalized =
      lastComma > lastDot
        ? cleaned.replace(/\./g, '').replace(',', '.')
        : cleaned.replace(/,/g, '');
  } else if (lastComma > -1) {
    // Single comma: decimal if followed by 1–2 digits, otherwise thousands.
    const after = cleaned.length - lastComma - 1;
    normalized = after > 0 && after <= 2 ? cleaned.replace(',', '.') : cleaned.replace(/,/g, '');
  } else {
    normalized = cleaned;
  }
  const value = Number(normalized);
  if (!Number.isFinite(value)) return null;
  return Math.round(value * 10 ** digits);
}

export function formatDate(
  iso: string | Date,
  locale: string,
  timeZone: string,
  style: 'short' | 'medium' | 'long' = 'medium',
): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  return new Intl.DateTimeFormat(locale, { dateStyle: style, timeZone }).format(d);
}

/** An instant (ISO timestamp) as a short date and time in the household's time zone. */
export function formatDateTime(iso: string | Date, locale: string, timeZone: string): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone,
  }).format(d);
}

/** "2026-09" → "Sep" (short), "September" (long) or "September 2026" (long-year). */
export function formatMonth(
  month: string,
  locale: string,
  style: 'short' | 'long' | 'long-year' = 'long',
): string {
  return new Intl.DateTimeFormat(locale, {
    month: style === 'short' ? 'short' : 'long',
    ...(style === 'long-year' ? { year: 'numeric' } : {}),
    timeZone: 'UTC',
  }).format(new Date(`${month.slice(0, 7)}-01T00:00:00Z`));
}

/** "2026-09-29" → "Tue" (short) or "Tuesday" (long). */
export function formatWeekday(day: string, locale: string, style: 'short' | 'long' = 'short') {
  return new Intl.DateTimeFormat(locale, { weekday: style, timeZone: 'UTC' }).format(
    new Date(`${day.slice(0, 10)}T00:00:00Z`),
  );
}

/**
 * A fraction as a percentage: 0.12 → "12%". `signed` shows the direction
 * ("+12%", "-8%") and reads anything under half a percent as "±0%".
 */
export function formatPercent(
  fraction: number,
  locale: string,
  opts: { signed?: boolean } = {},
): string {
  if (opts.signed && Math.abs(fraction) < 0.005) return '±0%';
  return new Intl.NumberFormat(locale, {
    style: 'percent',
    maximumFractionDigits: 0,
    ...(opts.signed ? { signDisplay: 'exceptZero' as const } : {}),
  }).format(fraction);
}

/** Quantities, not money: 191.3 → "191", 11.04 → "11", 3.456 → "3.5", 0.4457 → "0.45". */
export function formatQty(n: number, locale: string): string {
  const a = Math.abs(n);
  return new Intl.NumberFormat(locale, {
    maximumFractionDigits: a >= 100 ? 0 : a >= 1 ? 1 : 2,
  }).format(n);
}

/**
 * A price per unit of usage, as bills print it: 0.2953 with "AUD/kWh" → "$0.295/kWh".
 * `unitLabel` names the unit ("kWh", "kL").
 */
export function formatRate(
  value: number,
  unit: string,
  locale: string,
  unitLabel: (key: string) => string,
  fallbackCurrency: string,
): string {
  const [currency, per] = unit.split('/');
  const price = new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: currency || fallbackCurrency,
    maximumFractionDigits: 3,
  }).format(value);
  return `${price}/${unitLabel(per ?? '')}`;
}
