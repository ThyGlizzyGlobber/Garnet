import { getDb, type Db } from '@/db/client';
import type { Household } from '@/db/schema';
import { listBills } from '@/lib/bills';
import { compareUsage, usageHistory, type Change } from '@/lib/consumption';
import { addMonths } from '@/lib/periods';
import { projectMonth } from '@/lib/projections';
import { areaComparison } from '@/lib/regional';
import { seasonAhead } from '@/lib/seasons';
import type { ServiceWithType } from '@/lib/services';
import { splitView } from '@/lib/split-view';
import { weatherAdjusted } from '@/lib/weather-model';

const changeOf = (from: number, to: number): Change => ({
  from,
  to,
  pct: from ? (to - from) / from : null,
});

/**
 * Everything a service's page shows, worked out here so the page only formats
 * it: usage and how it compares (previous bill, last year, average, the
 * household's limit, similar households), usage by tariff band, the weather's
 * part in the change, households in the area, the next three months'
 * estimates, how it's split, and its latest bills.
 */
export function serviceOverview(
  hh: Household,
  svc: ServiceWithType,
  today: string,
  db: Db = getDb(),
) {
  const c = compareUsage(hh.id, svc.id, db);
  const history = usageHistory(hh.id, svc.id, db);
  const before = c?.previous?.period.parts ?? [];

  const comparisons: {
    against: 'previous' | 'lastYear' | 'average' | 'limit' | 'similar';
    usage: Change;
    cost?: Change;
    /** How many bills the average is of. */
    bills?: number;
    /** The household's monthly limit, in the usage unit. */
    limit?: number;
  }[] = [];
  if (c?.previous)
    comparisons.push({ against: 'previous', usage: c.previous.usage, cost: c.previous.cost });
  if (c?.lastYear)
    comparisons.push({ against: 'lastYear', usage: c.lastYear.usage, cost: c.lastYear.cost });
  if (c?.average)
    comparisons.push({
      against: 'average',
      usage: c.average.usage,
      cost: c.average.cost,
      bills: c.average.bills,
    });
  if (c?.limit)
    comparisons.push({ against: 'limit', usage: c.limit.usage, limit: c.limit.monthly });
  if (c?.similarHouseholds) comparisons.push({ against: 'similar', usage: c.similarHouseholds });

  return {
    usage: c,
    comparisons,
    /** Per-day usage of each bill that had usage, oldest first (the chart). */
    trend: (history?.periods ?? []).flatMap((p) =>
      p.perDay === null ? [] : [{ billId: p.billId, periodEnd: p.periodEnd, perDay: p.perDay }],
    ),
    /** The latest bill's usage by tariff band, each against the bill before. */
    bands: (c?.latest.parts ?? []).map((p) => {
      const was = before.find((b) => b.key === p.key);
      return { ...p, change: was ? changeOf(was.perDay, p.perDay) : null };
    }),
    weather: svc.seasonal ? weatherAdjusted(hh.id, svc.id, db) : null,
    seasons: seasonAhead(hh.id, today, db).filter((n) => n.serviceId === svc.id),
    // "Households like yours" (scope S4): only for households that share.
    area: areaComparison(hh.id, svc.id, today, db),
    /** The next three months' estimates, and what each is based on. */
    comingUp: [0, 1, 2].flatMap((i) => {
      const month = addMonths(today.slice(0, 7), i);
      const p = projectMonth(hh.id, month, db).services.find((x) => x.service.id === svc.id);
      return p && p.method !== 'none' ? [{ month, minor: p.monthMinor, method: p.method }] : [];
    }),
    // Who pays what (household services, in households that split bills).
    split: hh.splitMode === 'shared' && !svc.ownerMemberId ? splitView(hh.id, svc, db) : null,
    bills: listBills(hh.id, { serviceId: svc.id }, db).slice(0, 6),
  };
}
