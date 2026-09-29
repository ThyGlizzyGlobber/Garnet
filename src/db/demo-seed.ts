import { getDb, type Db } from '@/db/client';
import { hashPin } from '@/lib/auth/pin';
import { createBill } from '@/lib/bills';
import { and, eq, lt } from 'drizzle-orm';
import { bill, share } from '@/db/schema';
import { createHousehold, isSetUp } from '@/lib/households';
import { createMember } from '@/lib/members';
import { createService } from '@/lib/services';
import { PALETTE, TYPE_COLOUR } from '@/lib/palette';
import { demoExited } from '@/lib/demo';

/**
 * Fictional household for demos and screenshots. Never uses real names or numbers.
 * Amounts track typical Melbourne share-house costs (2026): rent ≈ $530/week,
 * quarterly electricity $410–530, bi-monthly-ish gas peaking in winter, water ≈ $300/quarter.
 */
export async function seedDemo(db: Db = getDb()) {
  if (isSetUp(db) || demoExited()) return { skipped: true };
  const hh = createHousehold(
    {
      name: 'Riverside House',
      currency: 'AUD',
      locale: 'en-AU',
      timezone: 'Australia/Sydney',
      fiscalYearStartMonth: 7,
      splitMode: 'shared',
      isDemo: true,
    },
    db,
  );
  const pin = await hashPin('1234');
  const alex = createMember(
    hh.id,
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
    hh.id,
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
    hh.id,
    { name: 'Sam', pinHash: pin, activeFrom: '2026-08-01', colour: PALETTE[4]!.light },
    db,
  );
  const internet = createService(
    hh.id,
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
    hh.id,
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
    hh.id,
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
    hh.id,
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
    hh.id,
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
      hh.id,
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
      hh.id,
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
      hh.id,
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
      hh.id,
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
      hh.id,
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
  // Annual council rates: the notice offers paying in full or in four instalments,
  // and nobody has chosen yet (the demo's "How will you pay?").
  const rates = createService(
    hh.id,
    {
      typeSlug: 'council_rates',
      name: 'Council rates',
      provider: 'Example City Council',
      cadence: 'annual',
      payerMemberId: alex.id,
      colour: TYPE_COLOUR.council_rates,
    },
    db,
  );
  createBill(
    hh.id,
    {
      serviceId: rates.id,
      amountMinor: 214035,
      periodStart: '2026-07-01',
      periodEnd: '2027-06-30',
      issueDate: '2026-08-11',
      dueDate: '2026-09-30',
      source: 'manual',
      externalRef: 'RATES-2026',
      instalments: [
        { dueDate: '2026-09-30', amountMinor: 53500 },
        { dueDate: '2026-11-30', amountMinor: 53500 },
        { dueDate: '2027-03-01', amountMinor: 53500 },
        { dueDate: '2027-05-31', amountMinor: 53535 },
      ],
    },
    db,
  );
  // Personal services: Alex's car rego and Jordan's car insurance. Each is seen
  // only by its owner and stays out of the household's figures.
  const rego = createService(
    hh.id,
    {
      typeSlug: 'vehicle_registration',
      name: 'Car rego',
      provider: 'Example Roads',
      cadence: 'annual',
      ownerMemberId: alex.id,
      colour: PALETTE[5]!.light,
    },
    db,
  );
  createBill(
    hh.id,
    {
      serviceId: rego.id,
      amountMinor: 89400,
      periodStart: '2026-08-15',
      periodEnd: '2027-08-14',
      issueDate: '2026-07-20',
      dueDate: '2026-08-14',
      source: 'manual',
      externalRef: 'REGO-2026',
      paidToProviderAt: paid('2026-08-10'),
    },
    db,
  );
  const carInsurance = createService(
    hh.id,
    {
      typeSlug: 'car_insurance',
      name: 'Car insurance',
      provider: 'Example Insure',
      cadence: 'monthly',
      ownerMemberId: jordan.id,
      colour: PALETTE[7]!.light,
    },
    db,
  );
  for (const [start, end, paidOn] of [
    ['2026-07-05', '2026-08-04', '2026-07-05'],
    ['2026-08-05', '2026-09-04', '2026-08-05'],
    ['2026-09-05', '2026-10-04', null],
  ] as const)
    createBill(
      hh.id,
      {
        serviceId: carInsurance.id,
        amountMinor: 11250,
        periodStart: start,
        periodEnd: end,
        dueDate: start,
        source: 'manual',
        externalRef: `CI-${start.slice(0, 7)}`,
        paidToProviderAt: paidOn ? paid(paidOn) : null,
      },
      db,
    );
  void sam;
  // Settle everything before the current cycle so the demo shows a realistic "who owes what".
  const settled = db
    .select({ id: bill.id })
    .from(bill)
    .where(and(eq(bill.householdId, hh.id), lt(bill.dueDate, '2026-09-01')))
    .all();
  const paidAt = '2026-09-01T00:00:00Z';
  for (const b of settled) {
    db.update(share)
      .set({ paidAt, paidMethod: 'transfer', updatedAt: paidAt })
      .where(eq(share.billId, b.id))
      .run();
  }
  return { household: hh.name, members: 3 };
}
