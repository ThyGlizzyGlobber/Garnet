import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { openDb, type Db } from '@/db/client';
import { runMigrations } from '@/db/migrate';
import { createBill } from '@/lib/bills';
import { compareUsage, figureChanges, householdUsage, usageHistory } from '@/lib/consumption';
import { createHousehold } from '@/lib/households';
import { createMember } from '@/lib/members';
import { listBillMetrics, saveBillMetrics } from '@/lib/metrics';
import { createService } from '@/lib/services';
import type { ExtractedMetric } from '@/ingest/extractors/types';

let dir: string;
let db: Db;
let close: () => void;

beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hud-consumption-'));
  runMigrations(dir);
  const opened = openDb(dir);
  db = opened.db;
  close = () => opened.sqlite.close();
});

afterAll(() => {
  close();
  fs.rmSync(dir, { recursive: true, force: true });
});

let n = 0;
function household() {
  const hh = createHousehold(
    {
      name: `Usage ${++n}`,
      currency: 'AUD',
      locale: 'en-AU',
      timezone: 'Australia/Melbourne',
      fiscalYearStartMonth: 7,
      splitMode: 'shared',
    },
    db,
  );
  const jo = createMember(hh.id, { name: 'Jo', role: 'owner', activeFrom: '2025-01-01' }, db);
  return { hh, jo };
}

const fig = (
  key: string,
  kind: ExtractedMetric['kind'],
  value: number | null,
  unit: string | null,
  amountMinor: number | null = null,
): ExtractedMetric => ({
  key,
  label: key,
  kind,
  value,
  unit,
  amountMinor,
  currency: amountMinor === null ? null : 'AUD',
  periodStart: null,
  periodEnd: null,
});

function electricity(limit?: number) {
  const { hh, jo } = household();
  const svc = createService(
    hh.id,
    {
      typeSlug: 'electricity',
      name: 'Electricity',
      provider: 'Red Energy',
      usageUnit: 'kWh',
      usageLimitMonthly: limit ?? null,
      payerMemberId: jo.id,
    },
    db,
  );
  const bill = (
    start: string,
    end: string,
    usage: number | null,
    amountMinor: number,
    figures: ExtractedMetric[] = [],
  ) => {
    const b = createBill(
      hh.id,
      {
        serviceId: svc.id,
        amountMinor,
        periodStart: start,
        periodEnd: end,
        dueDate: end,
        usageQuantity: usage,
        usageUnit: usage === null ? null : 'kWh',
        source: 'llm',
      },
      db,
    );
    saveBillMetrics(hh.id, b.id, figures, db);
    return b;
  };
  return { hh, svc, bill };
}

// Jan–Mar has 90 days in 2025 and 2026; Oct–Dec has 92.
describe('usage comparisons', () => {
  it('compare the latest bill per day with the last bill, last year and the recent average', () => {
    const { hh, svc, bill } = electricity();
    bill('2025-01-01', '2025-03-31', 900, 27000); // 10 kWh/day
    bill('2025-07-01', '2025-09-30', 1380, 41400); // 15 kWh/day (winter)
    bill('2025-10-01', '2025-12-31', 1104, 33120); // 12 kWh/day
    bill('2026-01-01', '2026-03-31', 990, 32400); // 11 kWh/day
    const c = compareUsage(hh.id, svc.id, db)!;
    expect(c.unit).toBe('kWh');
    expect(c.latest.perDay).toBeCloseTo(11);
    expect(c.previous!.usage.from).toBeCloseTo(12);
    expect(c.previous!.usage.pct).toBeCloseTo(-1 / 12); // 8.3% less per day
    expect(c.lastYear!.period.periodStart).toBe('2025-01-01');
    expect(c.lastYear!.usage.pct).toBeCloseTo(0.1); // 10% more than a year ago
    expect(c.average!.bills).toBe(3);
    expect(c.average!.usage.from).toBeCloseTo((10 + 15 + 12) / 3);
    expect(c.limit).toBeNull();
    // Cost per day: $360 / day-rate comparisons use cents per day.
    expect(c.lastYear!.cost.pct).toBeCloseTo(0.2);
  });

  it('measure against the household’s monthly limit, per day', () => {
    const { hh, svc, bill } = electricity(300); // ≈ 9.86 kWh/day
    bill('2026-01-01', '2026-03-31', 990, 32400);
    const c = compareUsage(hh.id, svc.id, db)!;
    expect(c.limit!.perDay).toBeCloseTo(300 / (365 / 12));
    expect(c.limit!.usage.pct).toBeCloseTo(11 / (300 / (365 / 12)) - 1); // ≈ 11.6% over
    expect(c.previous).toBeNull();
    expect(c.lastYear).toBeNull();
    expect(c.average).toBeNull();
  });

  it('use the sum of usage bands when a bill has no headline total, and similar households', () => {
    const { hh, svc, bill } = electricity();
    bill('2026-01-01', '2026-03-31', null, 32400, [
      fig('usage_peak', 'usage', 600, 'kWh'),
      fig('usage_off_peak', 'usage', 390, 'kWh'),
      fig('solar_export', 'usage', 200, 'kWh'),
      fig('similar_households_usage', 'comparison', 1100, 'kWh'),
    ]);
    const c = compareUsage(hh.id, svc.id, db)!;
    expect(c.latest.quantity).toBe(990);
    expect(c.latest.parts.map((p) => p.key)).toEqual(['usage_peak', 'usage_off_peak']);
    expect(c.similarHouseholds!.pct).toBeCloseTo(990 / 1100 - 1); // 10% below
  });

  it('convert between units of the same kind (gas billed in GJ, tracked in MJ)', () => {
    const { hh, jo } = household();
    const gas = createService(
      hh.id,
      { typeSlug: 'gas', name: 'Gas', provider: 'AGL', usageUnit: 'MJ', payerMemberId: jo.id },
      db,
    );
    createBill(
      hh.id,
      {
        serviceId: gas.id,
        amountMinor: 20000,
        periodStart: '2026-01-01',
        periodEnd: '2026-01-31',
        dueDate: '2026-02-20',
        usageQuantity: 3.1,
        usageUnit: 'GJ',
        source: 'llm',
      },
      db,
    );
    const h = usageHistory(hh.id, gas.id, db)!;
    expect(h.unit).toBe('MJ');
    expect(h.periods[0]!.quantity).toBeCloseTo(3100);
    expect(h.periods[0]!.perDay).toBeCloseTo(100);
  });

  it('skip services with no usage at all', () => {
    const { hh, jo } = household();
    const rent = createService(
      hh.id,
      { typeSlug: 'rent', name: 'Rent', provider: 'Landlord', payerMemberId: jo.id },
      db,
    );
    createBill(
      hh.id,
      {
        serviceId: rent.id,
        amountMinor: 230000,
        periodStart: '2026-01-01',
        periodEnd: '2026-01-31',
        dueDate: '2026-01-01',
        source: 'manual',
      },
      db,
    );
    expect(compareUsage(hh.id, rent.id, db)).toBeNull();
    expect(householdUsage(hh.id, db)).toEqual([]);
  });
});

describe('figure changes between bills', () => {
  it('compare rates directly, charges and usage per day, and leave readings alone', () => {
    const { hh, bill } = electricity();
    bill('2025-10-01', '2025-12-31', 1104, 33120, [
      fig('rate_peak', 'rate', 0.28, 'AUD/kWh'),
      fig('supply_charge', 'charge', null, null, 9200), // $1.00/day over 92 days
      fig('usage_peak', 'usage', 736, 'kWh'), // 8/day
      fig('meter_read_end', 'reading', 48211, 'kWh'),
    ]);
    const latest = bill('2026-01-01', '2026-03-31', 990, 32400, [
      fig('rate_peak', 'rate', 0.2953, 'AUD/kWh'),
      fig('supply_charge', 'charge', null, null, 9900), // $1.10/day over 90 days
      fig('usage_peak', 'usage', 630, 'kWh'), // 7/day
      fig('meter_read_end', 'reading', 49201, 'kWh'),
      fig('late_fee', 'charge', null, null, 1500), // new this time
    ]);
    const changes = figureChanges(hh.id, latest.id, db);
    const byKey = new Map(
      listBillMetrics(hh.id, latest.id, db).map((m) => [m.key, changes.get(m.id)?.pct ?? null]),
    );
    expect(byKey.get('rate_peak')).toBeCloseTo(0.2953 / 0.28 - 1);
    expect(byKey.get('supply_charge')).toBeCloseTo(0.1);
    expect(byKey.get('usage_peak')).toBeCloseTo(-0.125);
    expect(byKey.get('meter_read_end')).toBeNull();
    expect(byKey.get('late_fee')).toBeNull();
  });
});

describe('usage read over another period (water)', () => {
  function water() {
    const { hh, jo } = household();
    const svc = createService(
      hh.id,
      {
        typeSlug: 'water',
        name: 'Water',
        provider: 'Riverbend',
        usageUnit: 'kL',
        payerMemberId: jo.id,
      },
      db,
    );
    // Service charges for the quarter ahead; the water used between the last two readings.
    const bill = (start: string, end: string, usage: number, figures: ExtractedMetric[]) => {
      const b = createBill(
        hh.id,
        {
          serviceId: svc.id,
          amountMinor: 30_000,
          periodStart: start,
          periodEnd: end,
          dueDate: start,
          usageQuantity: usage,
          usageUnit: 'kL',
          source: 'llm',
        },
        db,
      );
      saveBillMetrics(hh.id, b.id, figures, db);
      return b;
    };
    return { hh, svc, bill };
  }

  it('works out a day over the meter-reading period, or the printed days, or the printed average', () => {
    const { hh, svc, bill } = water();
    // Read over 12 Mar – 10 Jun (91 days): 91 kL is 1 kL a day, though the bill is for Jul–Sep.
    bill('2026-07-01', '2026-09-30', 91, [
      {
        ...fig('water_usage', 'usage', 91, 'kL'),
        periodStart: '2026-03-12',
        periodEnd: '2026-06-10',
      },
    ]);
    // No dates on the figure, but "days in period: 92" printed: 46 kL over 92 days.
    bill('2026-10-01', '2026-12-31', 46, [fig('days_in_period', 'other', 92, 'days')]);
    // A printed average daily usage in litres wins: 1,500 L a day is 1.5 kL.
    bill('2027-01-01', '2027-03-31', 999, [fig('daily_average_usage', 'average', 1500, 'L/day')]);
    const h = usageHistory(hh.id, svc.id, db)!;
    expect(h.periods.map((p) => [p.periodStart, p.days, p.perDay])).toEqual([
      ['2026-03-12', 91, 1],
      ['2026-10-01', 92, 0.5],
      ['2027-01-01', 90, 1.5],
    ]);
    // The comparison follows: 1.5 against 0.5 a day is three times.
    expect(compareUsage(hh.id, svc.id, db)!.previous!.usage.pct).toBeCloseTo(2, 5);
  });
});
