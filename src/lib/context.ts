import type { Household, Member } from '@/db/schema';
import { requireMember } from '@/lib/auth/session';
import { todayIn } from '@/lib/dates';
import {
  formatDate,
  formatDateTime,
  formatMonth,
  formatMoney,
  formatPercent,
  formatQty,
} from '@/lib/format';
import { getHousehold } from '@/lib/households';

/**
 * Everything a page needs: the logged-in member, *their* household, and bound
 * formatters. Every query a page makes is scoped with `hh.id`.
 */
export async function pageContext() {
  const me = await requireMember();
  const hh = getHousehold(me.householdId);
  if (!hh) throw new Error('Household not found');
  return {
    hh,
    me,
    today: todayIn(hh.timezone),
    money: (
      minor: number,
      currency: string = hh.currency,
      opts?: { whole?: boolean; compact?: boolean },
    ) => formatMoney(minor, currency, hh.locale, opts),
    date: (iso: string | null | undefined, style: 'short' | 'medium' | 'long' = 'medium') =>
      iso
        ? formatDate(
            iso.length === 10 ? `${iso}T00:00:00Z` : iso,
            hh.locale,
            iso.length === 10 ? 'UTC' : hh.timezone,
            style,
          )
        : '',
    /** An instant, in the household's time zone ("29/9/26, 9:41 pm"). */
    dateTime: (iso: string | null | undefined) =>
      iso ? formatDateTime(iso, hh.locale, hh.timezone) : '',
    /** "2026-09" → "Sep" / "September" / "September 2026". */
    month: (month: string, style: 'short' | 'long' | 'long-year' = 'long') =>
      formatMonth(month, hh.locale, style),
    /** 0.12 → "12%"; signed: "+12%", "-8%", "±0%". */
    pct: (fraction: number, opts?: { signed?: boolean }) =>
      formatPercent(fraction, hh.locale, opts),
    /** Usage quantities (not money). */
    qty: (n: number) => formatQty(n, hh.locale),
  };
}

export type PageContext = { hh: Household; me: Member } & Awaited<ReturnType<typeof pageContext>>;
