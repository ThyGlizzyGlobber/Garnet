import type { Household, Member } from '@/db/schema';
import { requireMember } from '@/lib/auth/session';
import { todayIn } from '@/lib/dates';
import { formatDate, formatMoney } from '@/lib/format';
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
    money: (minor: number, currency: string = hh.currency) =>
      formatMoney(minor, currency, hh.locale),
    date: (iso: string | null | undefined, style: 'short' | 'medium' | 'long' = 'medium') =>
      iso
        ? formatDate(
            iso.length === 10 ? `${iso}T00:00:00Z` : iso,
            hh.locale,
            iso.length === 10 ? 'UTC' : hh.timezone,
            style,
          )
        : '',
  };
}

export type PageContext = { hh: Household; me: Member } & Awaited<ReturnType<typeof pageContext>>;
