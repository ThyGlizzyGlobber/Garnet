import { addDays } from '@/lib/dates';
import { billStatus, type BillStatus } from '@/lib/bill-status';
import type { BillListItem } from '@/lib/bills';
import { PALETTE, shadesOf } from '@/lib/palette';
import { addMonths } from '@/lib/periods';
import { MONTHS_PER_BILL } from '@/lib/projections';
import type { ServiceWithType } from '@/lib/services';
import { dueParts, expectedNext } from '@/lib/services-month';

/**
 * The overview at the top of a main service's page (Vehicles, Health,
 * Lifestyle, Subscriptions), like a service's own page: the last twelve
 * months by due date, month by month and by series (a kind of vehicle bill,
 * or a service), the average month, the next thing due, and the year ahead:
 * for each row (a vehicle, or a service), what's due or expected in each of
 * the next twelve months. Pure numbers; the page words them.
 */

export interface OverviewSeries {
  key: string;
  label: string;
  colour: string;
}

export interface OverviewRow {
  key: string;
  label: string;
  bills: BillListItem[];
  /** The services whose next bill this row expects (each with this row's bills of it). */
  services: ServiceWithType[];
  /** A stopped or cancelled service: left out of the year ahead once nothing is left to pay. */
  stopped?: boolean;
}

interface Due {
  billId: string | null;
  seriesKey: string;
  amountMinor: number | null;
  dueDate: string;
  paidAt: string | null;
  /** Not a bill yet: the next one, guessed from the ones before. */
  expected: boolean;
}

export interface MainOverview {
  series: OverviewSeries[];
  /** The last twelve months, oldest first, each by series. */
  months: { month: string; parts: { key: string; minor: number }[]; totalMinor: number }[];
  yearMinor: number;
  yearBills: number;
  perMonthMinor: number;
  /** The soonest unpaid bill (overdue first), else the next expected one. */
  next: {
    rowLabel: string;
    seriesKey: string;
    amountMinor: number | null;
    status: BillStatus | null;
    dueDate: string;
    billId: string | null;
  } | null;
  /** Each series over the last twelve months, largest first. */
  bySeries: (OverviewSeries & { minor: number; share: number })[];
  /** Each row over the last twelve months (vehicles, when there are several). */
  byRow: { key: string; label: string; minor: number; share: number }[];
  ahead: {
    /** This month and the eleven after it. */
    months: string[];
    rows: { key: string; label: string; items: (Due & { month: string })[] }[];
  };
}

/** The shade steps to hand out, base first then alternating lighter and darker. */
const SPREAD = [3, 5, 1, 6, 2, 7, 0, 4];

/**
 * Series that share a colour (Netflix and Spotify, both Subscriptions plum)
 * get shades of it instead, so a chart tells them apart without borrowing
 * another service's colour. A colour with no shades keeps the palette's.
 */
export function seriesColours<T extends { colour: string }>(xs: T[]): T[] {
  const seen = new Map<string, number>();
  const counts = new Map<string, number>();
  for (const x of xs)
    counts.set(x.colour.toLowerCase(), (counts.get(x.colour.toLowerCase()) ?? 0) + 1);
  return xs.map((x, i) => {
    const key = x.colour.toLowerCase();
    if (counts.get(key)! < 2) return x;
    const n = seen.get(key) ?? 0;
    seen.set(key, n + 1);
    const shades = shadesOf(x.colour);
    return {
      ...x,
      colour: shades.length
        ? shades[SPREAD[n % SPREAD.length]!]!
        : PALETTE[i % PALETTE.length]!.light,
    };
  });
}

export function mainOverview(input: {
  rows: OverviewRow[];
  /** Bills counted in the totals but in no row (waiting for a vehicle). */
  loose?: BillListItem[];
  series: OverviewSeries[];
  seriesOf: (b: BillListItem) => string;
  /** The series an expected bill of a service belongs to. */
  seriesOfService: (s: ServiceWithType) => string;
  today: string;
}): MainOverview {
  const { rows, series, seriesOf, today } = input;
  const thisMonth = today.slice(0, 7);
  const from = addDays(today, -365);

  const dues = (bills: BillListItem[]): Due[] =>
    bills.flatMap((b) =>
      dueParts(b).map((p) => ({
        billId: b.id,
        seriesKey: seriesOf(b),
        amountMinor: p.amountMinor,
        dueDate: p.dueDate,
        paidAt: p.paidAt,
        expected: false,
      })),
    );
  const all = dues([...rows.flatMap((r) => r.bills), ...(input.loose ?? [])]);
  const year = all.filter((d) => d.dueDate > from && d.dueDate <= today);
  const yearMinor = year.reduce((s, d) => s + (d.amountMinor ?? 0), 0);

  const past = Array.from({ length: 12 }, (_, i) => addMonths(thisMonth, i - 11));
  const months = past.map((month) => {
    const inMonth = all.filter((d) => d.dueDate.slice(0, 7) === month);
    const parts = series
      .map((s) => ({
        key: s.key,
        minor: inMonth
          .filter((d) => d.seriesKey === s.key)
          .reduce((sum, d) => sum + (d.amountMinor ?? 0), 0),
      }))
      .filter((p) => p.minor > 0);
    return { month, parts, totalMinor: parts.reduce((s, p) => s + p.minor, 0) };
  });

  const share = (minor: number) => (yearMinor ? minor / yearMinor : 0);
  const bySeries = series
    .map((s) => {
      const minor = year
        .filter((d) => d.seriesKey === s.key)
        .reduce((sum, d) => sum + (d.amountMinor ?? 0), 0);
      return { ...s, minor, share: share(minor) };
    })
    .filter((s) => s.minor > 0)
    .sort((a, b) => b.minor - a.minor);
  const byRow = rows
    .map((r) => {
      const minor = dues(r.bills)
        .filter((d) => d.dueDate > from && d.dueDate <= today)
        .reduce((sum, d) => sum + (d.amountMinor ?? 0), 0);
      return { key: r.key, label: r.label, minor, share: share(minor) };
    })
    .filter((r) => r.minor > 0)
    .sort((a, b) => b.minor - a.minor);

  // The year ahead: what's still to pay, and each service's bills expected
  // after its latest one, through the year.
  const aheadMonths = Array.from({ length: 12 }, (_, i) => addMonths(thisMonth, i));
  const last = aheadMonths.at(-1)!;
  const aheadRows = rows
    .map((r) => {
      const open = dues(r.bills).filter((d) => !d.paidAt);
      const expected = r.services.flatMap((svc): Due[] => {
        const own = r.bills.filter((b) => b.serviceId === svc.id);
        // Expected after its latest bill, paid or still to pay.
        const next = expectedNext(svc, own, today);
        if (!next) return [];
        // Then again each cadence through the year (a monthly subscription is
        // twelve marks, a quarterly bill four), at the same amount.
        const every = MONTHS_PER_BILL[svc.cadence];
        const dates = [next.dueDate];
        while (every && dates.length < 12) {
          const d = stepMonths(next.dueDate, every * dates.length);
          if (d.slice(0, 7) > last) break;
          dates.push(d);
        }
        return dates.map((dueDate) => ({
          billId: null,
          seriesKey: input.seriesOfService(svc),
          amountMinor: next.amountMinor,
          dueDate,
          paidAt: null,
          expected: true,
        }));
      });
      const items = [...open, ...expected]
        .map((d) => ({ ...d, month: d.dueDate.slice(0, 7) }))
        .map((d) => (d.month < thisMonth ? { ...d, month: thisMonth } : d))
        .filter((d) => d.month <= last)
        .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
      return { key: r.key, label: r.label, items };
    })
    // A stopped service with nothing left to pay has no row.
    .filter((r, i) => r.items.length || !rows[i]!.stopped);

  // Next: overdue or soonest unpaid, else the soonest expected.
  const rowOf = (billId: string | null, dueDate: string) =>
    aheadRows.find((r) => r.items.some((i) => i.billId === billId && i.dueDate === dueDate));
  const pending = aheadRows
    .flatMap((r) => r.items)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const first = pending.find((d) => !d.expected) ?? pending[0];

  return {
    series,
    months,
    yearMinor,
    yearBills: new Set(year.map((d) => d.billId)).size,
    perMonthMinor: perMonth([...rows.flatMap((r) => r.bills), ...(input.loose ?? [])], today),
    next: first
      ? {
          rowLabel: rowOf(first.billId, first.dueDate)?.label ?? '',
          seriesKey: first.seriesKey,
          amountMinor: first.amountMinor,
          status: first.expected ? null : billStatus(null, first.dueDate, today),
          dueDate: first.dueDate,
          billId: first.billId,
        }
      : null,
    bySeries,
    byRow,
    ahead: { months: aheadMonths, rows: aheadRows },
  };
}

/**
 * What it costs a month: each bill counted over the days of its period that
 * fall in the last twelve months (a yearly insurance paid in March counts
 * seven months of it by October), over twelve months, or over the months
 * since the first bill began when that's more recent (a gym joined in
 * January is $59 a month, not nine payments spread over a year).
 */
function perMonth(bills: BillListItem[], today: string): number {
  if (!bills.length) return 0;
  const from = addDays(today, -365);
  const ms = (d: string) => Date.parse(`${d}T00:00:00Z`);
  let accrued = 0;
  for (const b of bills) {
    const start = b.periodStart > from ? b.periodStart : from;
    const end = b.periodEnd < today ? b.periodEnd : today;
    if (end < start) continue;
    const days = (ms(b.periodEnd) - ms(b.periodStart)) / 86_400_000 + 1;
    const inside = (ms(end) - ms(start)) / 86_400_000 + 1;
    accrued += (b.amountMinor * inside) / Math.max(days, 1);
  }
  const first = bills.reduce((m, b) => (b.periodStart < m ? b.periodStart : m), today);
  const months =
    first > from ? Math.max(1, (ms(today) - ms(first)) / (86_400_000 * (365.25 / 12))) : 12;
  return Math.round(accrued / Math.min(12, months));
}

/** A date some months on, on the same day or the month's last ("2026-01-31" + 1 → "2026-02-28"). */
function stepMonths(date: string, months: number): string {
  const month = addMonths(date.slice(0, 7), months);
  const [y, m] = month.split('-').map(Number) as [number, number];
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${month}-${String(Math.min(Number(date.slice(8, 10)), lastDay)).padStart(2, '0')}`;
}
