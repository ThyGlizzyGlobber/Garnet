/**
 * "This week in the house": the facts behind a few plain sentences. The UI
 * turns them into words (ICU messages), so the wording stays in messages.
 */
export interface WeekItem {
  serviceName: string;
  /** Days until due: 0 today, 1 tomorrow… */
  days: number;
  dueDate: string;
  amountMinor: number;
  /** The viewer's share of a housemate's bill, rather than a bill they pay. */
  share: boolean;
  instalment: { n: number; of: number } | null;
}

export interface WeekDebt {
  fromName: string;
  toName: string;
  amountMinor: number;
  serviceName: string;
}

export interface WeekFacts {
  /** Already overdue. */
  overdue: WeekItem[];
  /** Due today or tomorrow. */
  soon: WeekItem[];
  /** Due in the rest of the week. */
  later: WeekItem[];
  /** Something overdue between two other housemates (the first). */
  debt: WeekDebt | null;
  /** Days in the next three that call for heating. */
  cold: number;
  /** Days in the next three that call for cooling. */
  hot: number;
}

export function weekFacts(
  upcoming: WeekItem[],
  debts: (WeekDebt & { overdue: boolean; involvesYou: boolean })[],
  weather: { heating: boolean; cooling: boolean }[] | null,
): WeekFacts {
  const week = upcoming.filter((u) => u.days <= 7);
  const three = (weather ?? []).slice(0, 3);
  const debt = debts.find((d) => d.overdue && !d.involvesYou) ?? null;
  return {
    overdue: week.filter((u) => u.days < 0),
    soon: week.filter((u) => u.days >= 0 && u.days <= 1),
    later: week.filter((u) => u.days > 1),
    debt: debt && {
      fromName: debt.fromName,
      toName: debt.toName,
      amountMinor: debt.amountMinor,
      serviceName: debt.serviceName,
    },
    cold: three.filter((d) => d.heating).length,
    hot: three.filter((d) => d.cooling).length,
  };
}
