import { and, eq, isNull } from 'drizzle-orm';
import { getDb, type Db } from '@/db/client';
import { bill, service, serviceType, share, type Member } from '@/db/schema';
import { fiscalYearBounds } from '@/lib/periods';
import { shareDueDate } from '@/lib/instalments';
import { isActiveOn, listMembers } from '@/lib/members';

/**
 * Money between housemates, for the Money page: every unpaid share is owed
 * to its bill's payer. From the viewer's side: what they owe, what is owed
 * to them, and what is owed between the others; per housemate, the balance
 * with the viewer and how many of this year's shares they have paid.
 */
export interface Debt {
  shareId: string;
  billId: string;
  serviceId: string;
  serviceName: string;
  icon: string;
  colour: string;
  fromId: string;
  toId: string;
  amountMinor: number;
  currency: string;
  dueDate: string;
  instalment: number | null;
  /** The bill's period. */
  periodStart: string;
  periodEnd: string;
}

interface MoneyPerson {
  member: Member;
  /** Positive: they owe the viewer; negative: the viewer owes them. */
  netMinor: number;
  owesYouMinor: number;
  youOweMinor: number;
  /** This financial year's shares of household bills they had to pay back, and how many are paid. */
  sharesThisFy: number;
  paidThisFy: number;
}

export interface MoneyView {
  /** Net position: owed to the viewer less what they owe. */
  netMinor: number;
  youOweMinor: number;
  owedToYouMinor: number;
  youOwe: Debt[];
  owedToYou: Debt[];
  between: Debt[];
  people: MoneyPerson[];
  /** Whom the viewer owes, by name, largest first (for the hero's sentence). */
  creditors: { member: Member; minor: number }[];
  /** The viewer's own shares this financial year that they had to pay back, and how many are paid. */
  yourShares: { total: number; paid: number };
  fyLabel: string;
}

export function moneyView(
  householdId: string,
  viewerId: string,
  today: string,
  fiscalYearStartMonth: number,
  db: Db = getDb(),
): MoneyView {
  // By move-in, then name, as everywhere else (unordered, housemates came back in id order).
  const members = listMembers(householdId, db);
  const byId = new Map(members.map((m) => [m.id, m]));
  const fy = fiscalYearBounds(today, fiscalYearStartMonth);
  const rows = db
    .select({ s: share, b: bill, svc: service, icon: serviceType.icon })
    .from(share)
    .innerJoin(bill, eq(share.billId, bill.id))
    .innerJoin(service, eq(bill.serviceId, service.id))
    .innerJoin(serviceType, eq(service.typeSlug, serviceType.slug))
    .where(and(eq(share.householdId, householdId), isNull(bill.ownerMemberId)))
    .all();
  const debts: Debt[] = [];
  const fyShares = new Map<string, { total: number; paid: number }>();
  for (const { s, b, svc, icon } of rows) {
    const payer = svc.payerMemberId;
    if (s.paidMethod === 'payer' || s.memberId === payer) continue;
    if (b.periodStart >= fy.start && b.periodStart <= fy.end) {
      const c = fyShares.get(s.memberId) ?? { total: 0, paid: 0 };
      c.total++;
      if (s.paidAt) c.paid++;
      fyShares.set(s.memberId, c);
    }
    if (s.paidAt || !payer) continue;
    debts.push({
      shareId: s.id,
      billId: b.id,
      serviceId: svc.id,
      serviceName: svc.name,
      icon,
      colour: svc.colour,
      fromId: s.memberId,
      toId: payer,
      amountMinor: s.amountMinor,
      currency: s.currency,
      dueDate: shareDueDate(s, b),
      instalment: s.instalment || null,
      periodStart: b.periodStart,
      periodEnd: b.periodEnd,
    });
  }
  // A bill paid by instalments: only a person's next unpaid instalment is owed now.
  const dueNow = debts.filter(
    (d) =>
      !d.instalment ||
      !debts.some(
        (o) =>
          o.billId === d.billId &&
          o.fromId === d.fromId &&
          o.instalment !== null &&
          o.instalment < d.instalment!,
      ),
  );
  debts.length = 0;
  debts.push(...dueNow);
  debts.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const youOwe = debts.filter((d) => d.fromId === viewerId);
  const owedToYou = debts.filter((d) => d.toId === viewerId);
  const between = debts.filter((d) => d.fromId !== viewerId && d.toId !== viewerId);
  const sum = (xs: Debt[]) => xs.reduce((s, d) => s + d.amountMinor, 0);
  const people = members
    .filter((m) => m.id !== viewerId && (isActiveOn(m, today) || fyShares.has(m.id)))
    .map((m): MoneyPerson => {
      const owesYou = sum(owedToYou.filter((d) => d.fromId === m.id));
      const youOweThem = sum(youOwe.filter((d) => d.toId === m.id));
      const c = fyShares.get(m.id) ?? { total: 0, paid: 0 };
      return {
        member: m,
        netMinor: owesYou - youOweThem,
        owesYouMinor: owesYou,
        youOweMinor: youOweThem,
        sharesThisFy: c.total,
        paidThisFy: c.paid,
      };
    });
  const creditors = [...new Set(youOwe.map((d) => d.toId))]
    .map((id) => ({ member: byId.get(id)!, minor: sum(youOwe.filter((d) => d.toId === id)) }))
    .filter((c) => c.member)
    .sort((a, b) => b.minor - a.minor);
  return {
    netMinor: sum(owedToYou) - sum(youOwe),
    youOweMinor: sum(youOwe),
    owedToYouMinor: sum(owedToYou),
    youOwe,
    owedToYou,
    between,
    people,
    creditors,
    yourShares: fyShares.get(viewerId) ?? { total: 0, paid: 0 },
    fyLabel: fy.label,
  };
}
