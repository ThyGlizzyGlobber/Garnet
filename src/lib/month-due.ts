import type { BillListItem } from '@/lib/bills';
import { paysByInstalments } from '@/lib/instalments';

/** The household's bills and instalments due in a month, and what the providers have. */
export interface MonthDue {
  bills: number;
  paidBills: number;
  dueMinor: number;
  paidMinor: number;
}

/**
 * What's due in a month and how much of it is paid: each household bill, or
 * each instalment of one paid by instalments, counted in full in the month
 * it's due. Personal bills are left out. One rule, so the This month widget
 * and the side menu's household card can never disagree.
 */
export function monthDue(bills: BillListItem[], start: string, end: string): MonthDue {
  const due = bills
    .filter((b) => !b.ownerMemberId)
    .flatMap((b) =>
      paysByInstalments(b)
        ? b.instalments.map((i) => ({
            dueDate: i.dueDate,
            minor: i.amountMinor,
            paid: !!i.paidToProviderAt,
          }))
        : [{ dueDate: b.dueDate, minor: b.amountMinor, paid: !!b.paidToProviderAt }],
    )
    .filter((x) => x.dueDate >= start && x.dueDate <= end);
  const paid = due.filter((x) => x.paid);
  return {
    bills: due.length,
    paidBills: paid.length,
    dueMinor: due.reduce((s, x) => s + x.minor, 0),
    paidMinor: paid.reduce((s, x) => s + x.minor, 0),
  };
}
