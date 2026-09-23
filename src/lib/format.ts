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

/** Convert minor units (e.g. cents) to a display string in the given locale. */
export function formatMoney(
  minor: number,
  currency: string,
  locale: string,
  opts: { compact?: boolean } = {},
): string {
  const digits = minorUnitDigits(currency);
  const major = minor / 10 ** digits;
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    ...(opts.compact ? { notation: 'compact', maximumFractionDigits: 1 } : {}),
  }).format(major);
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

export function formatNumber(value: number, locale: string, maximumFractionDigits = 1): string {
  return new Intl.NumberFormat(locale, { maximumFractionDigits }).format(value);
}
