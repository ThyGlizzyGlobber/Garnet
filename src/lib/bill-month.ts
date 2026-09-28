/**
 * The month a bill belongs to, as people think of it ("the August bill"): the
 * date it was issued. Without an issue date, the start of the period for bills
 * charged in advance (due before the period ends: internet, rent) and the end
 * of the period for bills charged in arrears (energy, water). Never the day an
 * email happened to arrive, so forwarding old bills files them in the right month.
 */
export function billDate(b: {
  issueDate: string | null;
  periodStart: string;
  periodEnd: string;
  dueDate: string;
}): string {
  if (b.issueDate) return b.issueDate;
  return b.dueDate < b.periodEnd ? b.periodStart : b.periodEnd;
}

/** YYYY-MM of billDate(). */
export function billMonth(b: Parameters<typeof billDate>[0]): string {
  return billDate(b).slice(0, 7);
}

/** "August 2026" for a YYYY-MM key. */
export function monthLabel(month: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${month}-01T00:00:00Z`));
}
