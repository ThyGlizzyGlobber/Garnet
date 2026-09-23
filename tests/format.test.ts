import { describe, expect, it } from 'vitest';
import { formatDate, formatMoney, minorUnitDigits, parseMoneyToMinor } from '@/lib/format';

describe('money formatting is locale and currency aware', () => {
  it('formats AUD cents for en-AU', () => {
    expect(formatMoney(12900, 'AUD', 'en-AU')).toBe('$129.00');
  });
  it('formats EUR cents for de-DE', () => {
    // Intl emits a non-breaking space before the symbol; normalise for the assertion.
    expect(formatMoney(123456, 'EUR', 'de-DE').replace(/\u00a0/g, ' ')).toBe('1.234,56 €');
  });
  it('handles zero-decimal currencies', () => {
    expect(minorUnitDigits('JPY')).toBe(0);
    expect(formatMoney(1500, 'JPY', 'ja-JP')).toBe('￥1,500');
  });
  it('falls back to 2 digits for an unknown currency', () => {
    expect(minorUnitDigits('ZZZ')).toBe(2);
  });
});

describe('parseMoneyToMinor', () => {
  it('parses plain decimals', () => {
    expect(parseMoneyToMinor('129.00', 'AUD')).toBe(12900);
    expect(parseMoneyToMinor('$129', 'AUD')).toBe(12900);
  });
  it('parses thousands separators in both conventions', () => {
    expect(parseMoneyToMinor('1,234.56', 'USD')).toBe(123456);
    expect(parseMoneyToMinor('1.234,56', 'EUR')).toBe(123456);
    expect(parseMoneyToMinor('12,50', 'EUR')).toBe(1250);
    expect(parseMoneyToMinor('1,500', 'USD')).toBe(150000);
  });
  it('returns null for garbage', () => {
    expect(parseMoneyToMinor('abc', 'AUD')).toBeNull();
    expect(parseMoneyToMinor('', 'AUD')).toBeNull();
  });
});

describe('formatDate', () => {
  it('respects locale and timezone', () => {
    const iso = '2026-06-26T00:00:00Z';
    expect(formatDate(iso, 'en-AU', 'Australia/Melbourne')).toBe('26 June 2026');
    expect(formatDate(iso, 'en-US', 'America/New_York', 'short')).toBe('6/25/26');
  });
});
