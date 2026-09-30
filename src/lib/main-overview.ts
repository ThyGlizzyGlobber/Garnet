import { addDays } from '@/lib/dates';
import { billStatus, type BillStatus } from '@/lib/bill-status';
import type { BillListItem } from '@/lib/bills';
import { PALETTE } from '@/lib/palette';
import { addMonths } from '@/lib/periods';
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

/** Distinct colours for series that would otherwise share one (sub-services of one type). */
export function seriesColours<T extends { colour: string }>(xs: T[]): T[] {
  const distinct = new Set(xs.map((x) => x.colour.toLowerCase())).size === xs.length;
  return distinct ? xs : xs.map((x, i) => ({ ...x, colour: PALETTE[i % PALETTE.length]!.light }));
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

  // The year ahead: what's still to pay, and each service's next bill when
  // none of its bills is still waiting to be paid.
  const aheadMonths = Array.from({ length: 12 }, (_, i) => addMonths(thisMonth, i));
  const last = aheadMonths.at(-1)!;
  const aheadRows = rows.map((r) => {
    const open = dues(r.bills).filter((d) => !d.paidAt);
    const expected = r.services.flatMap((svc): Due[] => {
      const own = r.bills.filter((b) => b.serviceId === svc.id);
      if (open.some((d) => own.some((b) => b.id === d.billId))) return [];
      const next = expectedNext(svc, own, today);
      return next
        ? [
            {
              billId: null,
              seriesKey: input.seriesOfService(svc),
              amountMinor: next.amountMinor,
              dueDate: next.dueDate,
              paidAt: null,
              expected: true,
            },
          ]
        : [];
    });
    const items = [...open, ...expected]
      .map((d) => ({ ...d, month: d.dueDate.slice(0, 7) }))
      .map((d) => (d.month < thisMonth ? { ...d, month: thisMonth } : d))
      .filter((d) => d.month <= last)
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
    return { key: r.key, label: r.label, items };
  });

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
    perMonthMinor: Math.round(yearMinor / 12),
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
