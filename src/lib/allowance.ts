import type { Household } from '@/db/schema';
import { getDb, type Db } from '@/db/client';
import { listBills, type BillListItem } from '@/lib/bills';
import { dueParts } from '@/lib/instalments';
import { isActiveOn, listMembers } from '@/lib/members';
import { addMonths, fiscalYearBounds, monthBounds } from '@/lib/periods';
import { isAdmin } from '@/lib/roles';

/**
 * A landlord's utilities allowance (SCOPE-accounts.md D17, from the owner's
 * mum's wizard, B2): utilities are included in the rent up to a cap per
 * period. The landlord logs the bills (and any ad-hoc expense, as a bill by
 * hand); the household's bills due in the period count against the cap; once
 * they exceed it the overage is owed by the tenants, split evenly between
 * those living there. Nothing is stored: it is worked out from the bills.
 * Tenants see the running total; the landlord also sees who owes what and
 * a message ready to send.
 */
interface AllowanceLine {
  billId: string;
  serviceId: string;
  serviceName: string;
  icon: string;
  colour: string;
  dueDate: string;
  amountMinor: number;
  /** A bill entered by hand: an ad-hoc expense, or a bill logged by the landlord. */
  byHand: boolean;
  instalment: number | null;
}

export interface AllowanceView {
  capMinor: number;
  period: Household['allowancePeriod'];
  /** The current period's bounds and a label ("October 2026", "Jul–Sep 2026", "2026–27"). */
  start: string;
  end: string;
  label: string;
  usedMinor: number;
  leftMinor: number;
  overMinor: number;
  /** Used over cap, 0–1+ (1 = at the cap). */
  fraction: number;
  lines: AllowanceLine[];
  /** Each tenant's part of the overage, evenly between those living there now. */
  owed: { memberId: string; name: string; colour: string; minor: number }[];
  currency: string;
  /** The last few periods, newest first, for the allowance page. */
  history: { start: string; end: string; label: string; usedMinor: number; overMinor: number }[];
}

/** Whether this household runs on an allowance (a let property with a cap). */
export const hasAllowance = (hh: Pick<Household, 'allowanceMinor'>): boolean =>
  hh.allowanceMinor !== null && hh.allowanceMinor > 0;

/** The period a day falls in, by the allowance's cadence. */
export function allowancePeriodBounds(
  day: string,
  period: Household['allowancePeriod'],
  fiscalYearStartMonth: number,
  locale: string,
): { start: string; end: string; label: string } {
  const month = day.slice(0, 7);
  if (period === 'year') return fiscalYearBounds(day, fiscalYearStartMonth);
  if (period === 'quarter') {
    // Quarters run from the financial year's start month.
    const fy = fiscalYearBounds(day, fiscalYearStartMonth);
    const fyStartMonth = fy.start.slice(0, 7);
    const monthsIn =
      (Number(month.slice(0, 4)) - Number(fyStartMonth.slice(0, 4))) * 12 +
      Number(month.slice(5, 7)) -
      Number(fyStartMonth.slice(5, 7));
    const qStart = addMonths(fyStartMonth, Math.floor(monthsIn / 3) * 3);
    const qEnd = addMonths(qStart, 2);
    const name = (m: string) =>
      new Intl.DateTimeFormat(locale, { month: 'short', timeZone: 'UTC' }).format(
        new Date(`${m}-01T00:00:00Z`),
      );
    return {
      start: monthBounds(qStart).start,
      end: monthBounds(qEnd).end,
      label: `${name(qStart)}–${name(qEnd)} ${qEnd.slice(0, 4)}`,
    };
  }
  const { start, end } = monthBounds(month);
  return {
    start,
    end,
    label: new Intl.DateTimeFormat(locale, {
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    }).format(new Date(`${month}-01T00:00:00Z`)),
  };
}

/** The bills (and instalments) due in a window, the household's own only: a landlord's personal costs stay out. */
function linesIn(bills: BillListItem[], start: string, end: string): AllowanceLine[] {
  return bills
    .filter((b) => !b.ownerMemberId)
    .flatMap((b) =>
      dueParts(b)
        .filter((p) => p.dueDate >= start && p.dueDate <= end)
        .map((p) => ({
          billId: b.id,
          serviceId: b.serviceId,
          serviceName: b.service.name,
          icon: b.service.type.icon,
          colour: b.service.colour,
          dueDate: p.dueDate,
          amountMinor: p.amountMinor,
          byHand: b.source === 'manual',
          instalment: p.seq || null,
        })),
    )
    .sort((a, b) => (a.dueDate < b.dueDate ? 1 : a.dueDate > b.dueDate ? -1 : 0));
}

export function allowanceView(
  hh: Household,
  today: string,
  db: Db = getDb(),
): AllowanceView | null {
  if (!hasAllowance(hh)) return null;
  const cap = hh.allowanceMinor!;
  const bounds = allowancePeriodBounds(
    today,
    hh.allowancePeriod,
    hh.fiscalYearStartMonth,
    hh.locale,
  );
  const bills = listBills(hh.id, {}, db);
  const lines = linesIn(bills, bounds.start, bounds.end);
  const used = lines.reduce((s, l) => s + l.amountMinor, 0);
  const over = Math.max(0, used - cap);
  const tenants = listMembers(hh.id, db).filter((m) => !isAdmin(m) && isActiveOn(m, today));
  const each = tenants.length ? Math.floor(over / tenants.length) : 0;
  const owed = tenants.map((m, i) => ({
    memberId: m.id,
    name: m.name,
    colour: m.colour,
    // The rounding goes to the first tenant, so the parts add up to the overage.
    minor: each + (i === 0 ? over - each * tenants.length : 0),
  }));
  // Up to six earlier periods with something in them.
  const history: AllowanceView['history'] = [];
  let cursor = bounds.start;
  for (let i = 0; i < 6; i++) {
    const prevDay = addDaysIso(cursor, -1);
    const b = allowancePeriodBounds(
      prevDay,
      hh.allowancePeriod,
      hh.fiscalYearStartMonth,
      hh.locale,
    );
    const usedThen = linesIn(bills, b.start, b.end).reduce((s, l) => s + l.amountMinor, 0);
    if (usedThen > 0)
      history.push({ ...b, usedMinor: usedThen, overMinor: Math.max(0, usedThen - cap) });
    cursor = b.start;
  }
  return {
    capMinor: cap,
    period: hh.allowancePeriod,
    ...bounds,
    usedMinor: used,
    leftMinor: Math.max(0, cap - used),
    overMinor: over,
    fraction: cap > 0 ? used / cap : 0,
    lines,
    owed,
    currency: hh.currency,
    history,
  };
}

function addDaysIso(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
