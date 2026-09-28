import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { openDb, type Db } from '@/db/client';
import { runMigrations } from '@/db/migrate';
import { anomalyNote, detectAnomaly } from '@/lib/anomaly';
import { createBill, deleteBill, getBill, listBills } from '@/lib/bills';
import { createHousehold } from '@/lib/households';
import { linkMember, signInAccount } from '@/lib/accounts';
import { devOutbox } from '@/lib/email';
import { createMember, listMembers } from '@/lib/members';
import { sendSeasonAhead } from '@/lib/notifications';
import { saveBillMetrics } from '@/lib/metrics';
import { climateOf, hemisphereOf, nextSeason, seasonAhead, seasonOf } from '@/lib/seasons';
import { createService } from '@/lib/services';

let dir: string;
let db: Db;
let close: () => void;

beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hud-seasons-'));
  runMigrations(dir);
  const opened = openDb(dir);
  db = opened.db;
  close = () => opened.sqlite.close();
});

afterAll(() => {
  close();
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('seasons', () => {
  it('follow the hemisphere and climate from the timezone', () => {
    expect(hemisphereOf('Australia/Melbourne')).toBe('south');
    expect(hemisphereOf('Europe/London')).toBe('north');
    expect(climateOf('Australia/Darwin')).toBe('tropical');
    expect(seasonOf(7, 'south', 'temperate')).toBe('winter');
    expect(seasonOf(7, 'north', 'temperate')).toBe('summer');
    expect(seasonOf(1, 'south', 'temperate')).toBe('summer');
    expect(seasonOf(4, 'south', 'temperate')).toBe('autumn');
    expect(seasonOf(10, 'south', 'temperate')).toBe('spring');
    expect(seasonOf(1, 'south', 'tropical')).toBe('wet');
    expect(seasonOf(7, 'south', 'tropical')).toBe('dry');
  });

  it('know when the next one starts', () => {
    expect(nextSeason('2026-05-10', 'south', 'temperate')).toEqual({
      season: 'winter',
      startMonth: '2026-06',
      daysUntil: 22,
      previous: 'autumn',
      previousStart: '2026-03',
    });
    expect(nextSeason('2026-10-20', 'south', 'tropical')).toMatchObject({
      season: 'wet',
      startMonth: '2026-11',
      previous: 'dry',
      previousStart: '2026-05',
    });
  });
});

const quarterly = (amountMinor: number, start: string, end: string) => ({
  amountMinor,
  periodStart: start,
  periodEnd: end,
});
// A southern household's electricity: winter costs ~40% more than autumn.
const lastYear = [
  quarterly(27600, '2025-03-01', '2025-05-31'), // autumn: $3.00/day
  quarterly(38640, '2025-06-01', '2025-08-31'), // winter: $4.20/day
  quarterly(27300, '2025-09-01', '2025-11-30'), // spring
  quarterly(25740, '2025-12-01', '2026-02-28'), // summer
  quarterly(27600, '2026-03-01', '2026-05-31'), // autumn again: $3.00/day
];

describe('the Unusual flag', () => {
  it('compares with the same time last year when there is one', () => {
    const normalWinter = quarterly(39560, '2026-06-01', '2026-08-31'); // $4.30/day
    const r = detectAnomaly(normalWinter, lastYear, { seasonal: true });
    expect(r.basis).toBe('last_year');
    expect(r.isAnomaly).toBe(false);
    const hugeWinter = quarterly(55200, '2026-06-01', '2026-08-31'); // $6.00/day
    const big = detectAnomaly(hugeWinter, lastYear, { seasonal: true });
    expect(big.isAnomaly).toBe(true);
    expect(anomalyNote(big.ratio!, big.basis!)).toBe('45% above the same time last year');
  });

  it('allows for the seasons on a seasonal service with no last year, but not on others', () => {
    const autumnOnly = [
      quarterly(9000, '2026-03-01', '2026-03-30'),
      quarterly(9300, '2026-04-01', '2026-04-30'),
      quarterly(9000, '2026-05-01', '2026-05-30'),
    ];
    const winterMonth = quarterly(12150, '2026-06-01', '2026-06-30'); // 35% above
    const seasonal = detectAnomaly(winterMonth, autumnOnly, { seasonal: true });
    expect(seasonal.isAnomaly).toBe(false);
    expect(seasonal.basis).toBe('seasonal_allowance');
    const internet = detectAnomaly(winterMonth, autumnOnly, { seasonal: false });
    expect(internet.isAnomaly).toBe(true);
    expect(internet.basis).toBe('recent');
    // Far beyond any season: still flagged, and the note says why.
    const doubled = detectAnomaly(quarterly(19000, '2026-06-01', '2026-06-30'), autumnOnly, {
      seasonal: true,
    });
    expect(doubled.isAnomaly).toBe(true);
    expect(anomalyNote(doubled.ratio!, doubled.basis!)).toMatch(
      /above your recent bills, more than the seasons usually explain/,
    );
  });
});

let n = 0;
function household(timezone = 'Australia/Melbourne') {
  const hh = createHousehold(
    {
      name: `Seasons ${++n}`,
      currency: 'AUD',
      locale: 'en-AU',
      timezone,
      fiscalYearStartMonth: 7,
      splitMode: 'shared',
    },
    db,
  );
  const jo = createMember(hh.id, { name: 'Jo', role: 'owner', activeFrom: '2025-01-01' }, db);
  const power = createService(
    hh.id,
    { typeSlug: 'electricity', name: 'Electricity', provider: 'Red Energy', payerMemberId: jo.id },
    db,
  );
  const net = createService(
    hh.id,
    { typeSlug: 'internet', name: 'Internet', provider: 'Aussie Broadband', payerMemberId: jo.id },
    db,
  );
  const add = (serviceId: string, b: ReturnType<typeof quarterly>, usage?: number) =>
    createBill(
      hh.id,
      {
        serviceId,
        ...b,
        dueDate: b.periodEnd,
        usageQuantity: usage ?? null,
        usageUnit: usage ? 'kWh' : null,
        source: 'manual',
      },
      db,
    );
  return { hh, power, net, add };
}

describe('flags on stored bills', () => {
  it('are seasonal by default for electricity and gas only', () => {
    const { power, net } = household();
    expect(power.seasonal).toBe(true);
    expect(net.seasonal).toBe(false);
  });

  it('are re-checked when bills arrive out of order', () => {
    const { hh, power, add } = household();
    // This winter arrives first, before any history: nothing to compare with.
    const winter = add(power.id, quarterly(39560, '2026-06-01', '2026-08-31'));
    // Then last year's bills are forwarded, oldest last.
    for (const b of [...lastYear].reverse()) add(power.id, b);
    const after = getBill(hh.id, winter.id, db)!;
    expect(after.isAnomaly).toBe(false);
    expect(after.anomalyBasis).toBe('last_year');
    // Deleting last winter's bill re-checks again, now against the seasonal allowance.
    const lastWinter = listBills(hh.id, { serviceId: power.id }, db).find(
      (b) => b.periodStart === '2025-06-01',
    )!;
    deleteBill(hh.id, lastWinter.id, db);
    expect(getBill(hh.id, winter.id, db)!.anomalyBasis).toBe('seasonal_allowance');
  });
});

describe('season-ahead notices', () => {
  it('say what last year’s change of season did, and what it means a month now', () => {
    const { hh, power, net, add } = household();
    const usage = [900, 1260, 910, 780, 900];
    lastYear.forEach((b, i) => add(power.id, b, usage[i]));
    lastYear.forEach((b) => add(net.id, { ...b, amountMinor: 8900 * 3 }));
    const bills = listBills(hh.id, { serviceId: power.id }, db);
    const byStart = (s: string) => bills.find((b) => b.periodStart === s)!.id;
    saveBillMetrics(hh.id, byStart('2025-03-01'), [solar(460)], db);
    saveBillMetrics(hh.id, byStart('2025-06-01'), [solar(276)], db);

    expect(seasonAhead(hh.id, '2026-04-20', db)).toEqual([]); // six weeks out: too early
    const [notice, ...rest] = seasonAhead(hh.id, '2026-05-10', db);
    expect(rest).toEqual([]); // internet isn't seasonal
    expect(notice).toMatchObject({
      serviceId: power.id,
      season: 'winter',
      previous: 'autumn',
      startMonth: '2026-06',
      daysUntil: 22,
      basisYear: '2025',
      currency: 'AUD',
    });
    expect(notice!.costRatio).toBeCloseTo(1.4, 2);
    expect(notice!.usageRatio).toBeCloseTo(1260 / 92 / (900 / 92), 2);
    expect(notice!.solarRatio).toBeCloseTo(276 / 460, 2);
    // $3.00/day now × 40% × 30.4 days ≈ $36.50 more a month.
    expect(notice!.monthlyImpactMinor).toBeGreaterThan(3500);
    expect(notice!.monthlyImpactMinor).toBeLessThan(3700);
  });

  it('say nothing without last year’s bills', () => {
    const { hh, power, add } = household();
    add(power.id, quarterly(27600, '2026-03-01', '2026-05-31'));
    expect(seasonAhead(hh.id, '2026-05-10', db)).toEqual([]);
  });
});

describe('season-ahead emails', () => {
  it('go to the payer once per service and season, in daytime', async () => {
    const { hh, power, add } = household();
    const payer = listMembers(hh.id, db)[0]!;
    const account = signInAccount({ email: `payer${n}@example.com` }, db);
    linkMember(payer.id, account.id, account.email, db);
    lastYear.forEach((b) => add(power.id, b));
    const night = new Date('2026-05-09T13:00:00Z'); // 11pm in Melbourne
    expect(await sendSeasonAhead(night, db)).toBe(0);
    const morning = new Date('2026-05-09T23:00:00Z'); // 9am on 10 May
    expect(await sendSeasonAhead(morning, db)).toBe(1);
    expect(await sendSeasonAhead(morning, db)).toBe(0);
    const mail = devOutbox.filter((e) => e.to === account.email).at(-1)!;
    expect(mail.subject).toMatch(
      /^Winter is coming: Electricity usually costs about \$3\d\.\d\d a month$/,
    );
    expect(mail.text).toContain('Winter starts in 22 days.');
    expect(mail.text).toContain('Last winter, your Electricity cost 40% more a day than in autumn');
    expect(mail.text).toContain(`/services/${power.id}`);
  });
});

function solar(kWh: number) {
  return {
    key: 'solar_export',
    label: 'Solar exported',
    kind: 'usage' as const,
    value: kWh,
    unit: 'kWh',
    amountMinor: null,
    currency: null,
    periodStart: null,
    periodEnd: null,
  };
}
