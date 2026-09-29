import { and, desc, eq } from 'drizzle-orm';
import { getDb, type Db } from '@/db/client';
import { bill, type Member } from '@/db/schema';
import { todayIn } from '@/lib/dates';
import { formatMinorPlain } from '@/lib/format';
import { getHousehold } from '@/lib/households';
import { listMembers } from '@/lib/members';
import { getCustomSplits, getFixedAmounts, type ServiceWithType } from '@/lib/services';
import { resplittableBills } from '@/lib/bills';
import { computeShares } from '@/lib/splits';

/** One person's part of a service, as set, and what it came to on the latest bill. */
export interface SplitPart {
  member: Member;
  /** equal: even share; percent: their %; fixed: their amount, or they share the rest. */
  setting:
    | { kind: 'even' }
    | { kind: 'percent'; value: number }
    | { kind: 'amount'; minor: number }
    | { kind: 'rest' }
    | { kind: 'weight'; value: number };
  /** Their share of the latest bill (everyone there for all of it); null without one. */
  exampleMinor: number | null;
}

export interface SplitView {
  mode: ServiceWithType['splitMode'];
  parts: SplitPart[];
  latestMinor: number | null;
  /** Stored percentages (normalised to 100) and amounts (major units), for the form. */
  percents: Record<string, number>;
  amounts: Record<string, string>;
  /** Earlier bills a changed split can still apply to. */
  resplitCount: number;
}

/**
 * How a household service is split, for its page and its form: the people
 * living there now (or about to), each one's setting, and what each would pay
 * of the latest bill.
 */
export function splitView(
  householdId: string,
  svc: Pick<ServiceWithType, 'id' | 'splitMode' | 'payerMemberId'>,
  db: Db = getDb(),
): SplitView {
  const hh = getHousehold(householdId, db)!;
  const today = todayIn(hh.timezone);
  const members = listMembers(householdId, db).filter(
    (m) => m.activeTo === null || m.activeTo >= today,
  );
  const latest = db
    .select({ amountMinor: bill.amountMinor })
    .from(bill)
    .where(and(eq(bill.householdId, householdId), eq(bill.serviceId, svc.id)))
    .orderBy(desc(bill.periodStart))
    .get();
  const weights =
    svc.splitMode === 'percent' || svc.splitMode === 'custom'
      ? getCustomSplits(householdId, svc.id, db)
      : {};
  const weightTotal = Object.values(weights).reduce((s, v) => s + v, 0);
  const percents = Object.fromEntries(
    Object.entries(weights).map(([id, w]) => [
      id,
      weightTotal > 0 ? Math.round((w * 10000) / weightTotal) / 100 : 0,
    ]),
  );
  const fixed = svc.splitMode === 'fixed' ? getFixedAmounts(householdId, svc.id, db) : {};
  const example = latest?.amountMinor ?? 0;
  const shares =
    example > 0
      ? computeShares({
          amountMinor: example,
          periodStart: '2026-01-01',
          periodEnd: '2026-01-30',
          splitMode: svc.splitMode,
          members: members.map((m) => ({ ...m, activeFrom: '2000-01-01', activeTo: null })),
          customWeights: weights,
          fixedAmounts: fixed,
          payerMemberId: svc.payerMemberId,
        })
      : [];
  const parts: SplitPart[] = members.map((m) => ({
    member: m,
    setting:
      svc.splitMode === 'percent' || svc.splitMode === 'custom'
        ? { kind: 'percent', value: percents[m.id] ?? 0 }
        : svc.splitMode === 'fixed'
          ? fixed[m.id] !== undefined
            ? { kind: 'amount', minor: fixed[m.id]! }
            : { kind: 'rest' }
          : svc.splitMode === 'weighted'
            ? { kind: 'weight', value: m.splitWeight }
            : { kind: 'even' },
    exampleMinor: example > 0 ? (shares.find((s) => s.memberId === m.id)?.amountMinor ?? 0) : null,
  }));
  return {
    mode: svc.splitMode,
    parts,
    latestMinor: latest?.amountMinor ?? null,
    percents,
    amounts: Object.fromEntries(
      Object.entries(fixed).map(([id, minor]) => [id, formatMinorPlain(minor, hh.currency)]),
    ),
    resplitCount: resplittableBills(householdId, svc.id, db).length,
  };
}
