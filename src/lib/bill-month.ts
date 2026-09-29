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

/**
 * Items grouped by the month of their date (YYYY-MM), newest month first and
 * newest first within a month. Bills, the Inbox and the ledger list this way.
 */
export function groupByMonth<T>(items: T[], dateOf: (item: T) => string): [string, T[]][] {
  const groups = new Map<string, T[]>();
  for (const item of [...items].sort((a, b) => dateOf(b).localeCompare(dateOf(a)))) {
    const month = dateOf(item).slice(0, 7);
    groups.set(month, [...(groups.get(month) ?? []), item]);
  }
  return [...groups.entries()];
}
