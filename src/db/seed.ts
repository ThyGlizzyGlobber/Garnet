import { getDb, type Db } from '@/db/client';
import { hashPin } from '@/lib/auth/pin';
import { createBill, listBills } from '@/lib/bills';
import { eq, lt } from 'drizzle-orm';
import { bill, share } from '@/db/schema';
import { todayIn } from '@/lib/dates';
import { createHousehold, getHousehold } from '@/lib/households';
import { createMember, listMembers } from '@/lib/members';
import { createService, listServices } from '@/lib/services';
import { PALETTE, TYPE_COLOUR } from '@/lib/palette';
import { demoExited, markDemoSeeded } from '@/lib/demo';

/**
 * Real seed: the four Aussie Broadband invoices from sample-bills/ (values only,
 * no personal details). Requires a household; creates a minimal development one
 * if none exists so `npm run db:seed` works on a fresh checkout.
 */
export async function seedReal(db: Db = getDb()) {
  let hh = getHousehold(db);
  if (!hh) {
    hh = createHousehold(
      {
        name: 'Development Household',
        currency: 'AUD',
        locale: 'en-AU',
        timezone: 'Australia/Melbourne',
        fiscalYearStartMonth: 7,
        splitMode: 'shared',
      },
      db,
    );
    createMember(
      { name: 'Owner', pinHash: await hashPin('1234'), role: 'owner', activeFrom: '2025-01-01' },
      db,
    );
  }
  const owner = listMembers(db).find((m) => m.role === 'owner') ?? listMembers(db)[0];
  let internet = listServices(db, true).find((s) => s.provider === 'Aussie Broadband');
  if (!internet) {
    internet = createService(
      {
        typeSlug: 'internet',
        name: 'Internet',
        provider: 'Aussie Broadband',
        accountRef: '14809800',
        cadence: 'monthly',
        payerMemberId: owner?.id ?? null,
        colour: TYPE_COLOUR.internet,
      },
      db,
    );
  }
  const existing = new Set(listBills(db, { serviceId: internet.id }).map((b) => b.externalRef));
  const invoices = [
    {
      ref: '59259831',
      start: '2026-06-14',
      end: '2026-07-13',
      issued: '2026-06-14',
      due: '2026-06-26',
    },
    {
      ref: '60097874',
      start: '2026-07-14',
      end: '2026-08-13',
      issued: '2026-07-14',
      due: '2026-07-28',
    },
    {
      ref: '61058821',
      start: '2026-08-14',
      end: '2026-09-13',
      issued: '2026-08-14',
      due: '2026-08-28',
    },
    {
      ref: '62143961',
      start: '2026-09-14',
      end: '2026-10-13',
      issued: '2026-09-14',
      due: '2026-09-28',
    },
  ];
  let added = 0;
  for (const inv of invoices) {
    if (existing.has(inv.ref)) continue;
    createBill(
      {
        serviceId: internet.id,
        amountMinor: 12900,
        currency: 'AUD',
        taxMinor: 1173,
        taxLabel: 'GST',
        periodStart: inv.start,
        periodEnd: inv.end,
        issueDate: inv.issued,
        dueDate: inv.due,
        source: 'manual',
        externalRef: inv.ref,
        paidToProviderAt: inv.due <= todayIn(hh.timezone) ? `${inv.due}T00:00:00Z` : null,
        notes: 'Seeded from sample-bills/',
      },
      db,
    );
    added++;
  }
  return { household: hh.name, billsAdded: added };
}

/**
 * Fictional household for demos and screenshots. Never uses real names or numbers.
 * Amounts track typical Melbourne share-house costs (2026): rent ≈ $530/week,
 * quarterly electricity $410–530, bi-monthly-ish gas peaking in winter, water ≈ $300/quarter.
 */
export async function seedDemo(db: Db = getDb()) {
  if (getHousehold(db) || demoExited()) return { skipped: true };
  const hh = createHousehold(
    {
      name: 'Riverside House',
      currency: 'AUD',
      locale: 'en-AU',
      timezone: 'Australia/Sydney',
      fiscalYearStartMonth: 7,
      splitMode: 'shared',
    },
    db,
  );
  const pin = await hashPin('1234');
  const alex = createMember(
    {
      name: 'Alex',
      pinHash: pin,
      role: 'owner',
      activeFrom: '2025-02-01',
      colour: PALETTE[0]!.light,
      paymentDetails: [{ label: 'PayID', value: 'alex@example.com' }],
    },
    db,
  );
  const jordan = createMember(
    {
      name: 'Jordan',
      pinHash: pin,
      activeFrom: '2025-02-01',
      colour: PALETTE[2]!.light,
      paymentDetails: [{ label: 'PayID', value: '0400 000 000' }],
    },
    db,
  );
  const sam = createMember(
    { name: 'Sam', pinHash: pin, activeFrom: '2026-08-01', colour: PALETTE[4]!.light },
    db,
  );
  const internet = createService(
    {
      typeSlug: 'internet',
      name: 'Internet',
      provider: 'Example Broadband',
      cadence: 'monthly',
      payerMemberId: alex.id,
      colour: TYPE_COLOUR.internet,
    },
    db,
  );
  const power = createService(
    {
      typeSlug: 'electricity',
      name: 'Electricity',
      provider: 'Example Energy',
      cadence: 'quarterly',
      usageUnit: 'kWh',
      payerMemberId: jordan.id,
      colour: TYPE_COLOUR.electricity,
    },
    db,
  );
  const gas = createService(
    {
      typeSlug: 'gas',
      name: 'Gas',
      provider: 'Example Gas',
      cadence: 'bimonthly',
      usageUnit: 'MJ',
      payerMemberId: jordan.id,
      colour: TYPE_COLOUR.gas,
    },
    db,
  );
  const water = createService(
    {
      typeSlug: 'water',
      name: 'Water',
      provider: 'Example Water',
      cadence: 'quarterly',
      usageUnit: 'kL',
      payerMemberId: alex.id,
      colour: TYPE_COLOUR.water,
    },
    db,
  );
  const rent = createService(
    {
      typeSlug: 'rent',
      name: 'Rent',
      provider: 'Landlord',
      cadence: 'monthly',
      payerMemberId: alex.id,
      colour: TYPE_COLOUR.rent,
    },
    db,
  );
  const paid = (d: string) => `${d}T00:00:00Z`;
  const months = [
    '2025-10',
    '2025-11',
    '2025-12',
    '2026-01',
    '2026-02',
    '2026-03',
    '2026-04',
    '2026-05',
    '2026-06',
    '2026-07',
    '2026-08',
    '2026-09',
  ];
  months.forEach((m, i) => {
    const [y, mo] = m.split('-').map(Number) as [number, number];
    const end = new Date(Date.UTC(y, mo, 0)).toISOString().slice(0, 10);
    createBill(
      {
        serviceId: internet.id,
        amountMinor: 8900,
        periodStart: `${m}-01`,
        periodEnd: end,
        dueDate: `${m}-15`,
        source: 'manual',
        externalRef: `INT-${m}`,
        paidToProviderAt: i < 11 ? paid(`${m}-15`) : null,
      },
      db,
    );
    createBill(
      {
        serviceId: rent.id,
        amountMinor: 230000,
        periodStart: `${m}-01`,
        periodEnd: end,
        dueDate: `${m}-01`,
        source: 'manual',
        externalRef: `RENT-${m}`,
        paidToProviderAt: paid(`${m}-01`),
      },
      db,
    );
  });
  const quarters = [
    {
      s: '2025-10-01',
      e: '2025-12-31',
      due: '2026-01-20',
      kwh: 1180,
      amt: 41250,
      gasMj: 9800,
      gasAmt: 28400,
      water: 42,
      waterAmt: 31800,
    },
    {
      s: '2026-01-01',
      e: '2026-03-31',
      due: '2026-04-20',
      kwh: 1320,
      amt: 45900,
      gasMj: 6100,
      gasAmt: 21100,
      water: 48,
      waterAmt: 34600,
    },
    {
      s: '2026-04-01',
      e: '2026-06-30',
      due: '2026-07-20',
      kwh: 1410,
      amt: 48300,
      gasMj: 14200,
      gasAmt: 37900,
      water: 39,
      waterAmt: 30200,
    },
    {
      s: '2026-07-01',
      e: '2026-09-30',
      due: '2026-10-20',
      kwh: 1560,
      amt: 53100,
      gasMj: 17600,
      gasAmt: 44800,
      water: 41,
      waterAmt: 31100,
    },
  ];
  quarters.forEach((q, i) => {
    createBill(
      {
        serviceId: power.id,
        amountMinor: q.amt,
        taxMinor: Math.round(q.amt / 11),
        taxLabel: 'GST',
        periodStart: q.s,
        periodEnd: q.e,
        dueDate: q.due,
        usageQuantity: q.kwh,
        usageUnit: 'kWh',
        source: 'manual',
        externalRef: `PWR-${i}`,
        paidToProviderAt: i < 3 ? paid(q.due) : null,
      },
      db,
    );
    createBill(
      {
        serviceId: gas.id,
        amountMinor: q.gasAmt,
        periodStart: q.s,
        periodEnd: q.e,
        dueDate: q.due,
        usageQuantity: q.gasMj,
        usageUnit: 'MJ',
        source: 'manual',
        externalRef: `GAS-${i}`,
        paidToProviderAt: i < 3 ? paid(q.due) : null,
      },
      db,
    );
    createBill(
      {
        serviceId: water.id,
        amountMinor: q.waterAmt,
        periodStart: q.s,
        periodEnd: q.e,
        dueDate: q.due,
        usageQuantity: q.water,
        usageUnit: 'kL',
        source: 'manual',
        externalRef: `WTR-${i}`,
        paidToProviderAt: i < 3 ? paid(q.due) : null,
      },
      db,
    );
  });
  void sam;
  // Settle everything before the current cycle so the demo shows a realistic "who owes what".
  const settled = db.select({ id: bill.id }).from(bill).where(lt(bill.dueDate, '2026-09-01')).all();
  const paidAt = '2026-09-01T00:00:00Z';
  for (const b of settled) {
    db.update(share)
      .set({ paidAt, paidMethod: 'transfer', updatedAt: paidAt })
      .where(eq(share.billId, b.id))
      .run();
  }
  markDemoSeeded();
  return { household: hh.name, members: 3 };
}
