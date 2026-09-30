import { getDb, type Db } from '@/db/client';
import { hashPin } from '@/lib/auth/pin';
import {
  createBill,
  getBill,
  setInstalmentPaid,
  setPaymentPlan,
  setSharePaid,
  type BillInput,
} from '@/lib/bills';
import { bill } from '@/db/schema';
import { createHousehold, isSetUp } from '@/lib/households';
import { setHouseholdLocation } from '@/lib/location';
import { createMember } from '@/lib/members';
import { createService } from '@/lib/services';
import { demoExited } from '@/lib/demo';
import { eq } from 'drizzle-orm';
import { sourceDocument, type Member, type Service } from '@/db/schema';
import { archiveDocument } from '@/ingest/archive';
import type { StoredExtraction } from '@/ingest/pipeline';

/**
 * The fictional demo household, "Riverside House" (Alex, Jordan, Sam), with
 * the Redesign Studio's data (brand-identity/inspiration/redesign-studio/
 * js/data.js), so screenshots of the app and the studio compare directly:
 * Harbour Lane Realty rent split 40/30/30, Northwind electricity, Hearthline
 * gas, Riverbend water, Brightline internet, City of Riverside rates paid by
 * instalments, Alex's own car rego, and Sam moving in on 1 August 2026.
 * No real names, providers or numbers. The studio's "today" is 29 Sep 2026,
 * so what's paid and what's owed match it whatever the real date is.
 */
const TODAY = '2026-09-29';
const PIN = '1234';

const D = (s: string) => new Date(`${s}T00:00:00Z`);
const iso = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (s: string, n: number) => {
  const d = D(s);
  d.setUTCDate(d.getUTCDate() + n);
  return iso(d);
};
const monthEnd = (y: number, m: number) => iso(new Date(Date.UTC(y, m, 0)));
const mm = (n: number) => String(n).padStart(2, '0');
const at = (day: string) => `${day}T00:00:00Z`;

export async function seedDemo(db: Db = getDb()) {
  if (isSetUp(db) || demoExited()) return { skipped: true };
  const hh = createHousehold(
    {
      name: 'Riverside House',
      currency: 'AUD',
      locale: 'en-AU',
      timezone: 'Australia/Melbourne',
      fiscalYearStartMonth: 7,
      splitMode: 'shared',
      isDemo: true,
    },
    db,
  );
  // A postcode, so the weather card and the seasons have somewhere to be.
  setHouseholdLocation(hh.id, { country: 'AU', postalCode: '3550', locality: 'Bendigo' }, db);
  const pin = await hashPin(PIN);
  const alex = createMember(
    hh.id,
    {
      name: 'Alex',
      pinHash: pin,
      role: 'owner',
      activeFrom: '2025-02-01',
      colour: '#2a78d6',
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
      colour: '#1baf7a',
      paymentDetails: [{ label: 'PayID', value: '0400 000 000' }],
    },
    db,
  );
  const sam = createMember(
    hh.id,
    {
      name: 'Sam',
      pinHash: pin,
      activeFrom: '2026-08-01',
      colour: '#e87ba4',
      paymentDetails: [{ label: 'BSB / account', value: '000-000 · 1234 5678' }],
    },
    db,
  );
  const who = { alex: alex.id, jordan: jordan.id, sam: sam.id } as const;
  type Who = keyof typeof who;

  const rent = createService(
    hh.id,
    {
      typeSlug: 'rent',
      name: 'Rent',
      provider: 'Harbour Lane Realty',
      cadence: 'monthly',
      payerMemberId: alex.id,
      colour: '#4a3aa7',
      splitMode: 'percent',
      customSplits: { [alex.id]: 40, [jordan.id]: 30, [sam.id]: 30 },
    },
    db,
  );
  const power = createService(
    hh.id,
    {
      typeSlug: 'electricity',
      name: 'Electricity',
      provider: 'Northwind Energy',
      cadence: 'quarterly',
      usageUnit: 'kWh',
      usageLimitMonthly: 600,
      seasonal: true,
      payerMemberId: jordan.id,
      colour: '#eda100',
    },
    db,
  );
  const gas = createService(
    hh.id,
    {
      typeSlug: 'gas',
      name: 'Gas',
      provider: 'Hearthline Gas',
      cadence: 'bimonthly',
      usageUnit: 'MJ',
      seasonal: true,
      payerMemberId: jordan.id,
      colour: '#eb6834',
    },
    db,
  );
  const water = createService(
    hh.id,
    {
      typeSlug: 'water',
      name: 'Water',
      provider: 'Riverbend Water',
      cadence: 'quarterly',
      usageUnit: 'kL',
      payerMemberId: alex.id,
      colour: '#1baf7a',
    },
    db,
  );
  const net = createService(
    hh.id,
    {
      typeSlug: 'internet',
      name: 'Internet',
      provider: 'Brightline Broadband',
      cadence: 'monthly',
      payerMemberId: alex.id,
      colour: '#2a78d6',
    },
    db,
  );
  const rates = createService(
    hh.id,
    {
      typeSlug: 'council_rates',
      name: 'Council rates',
      provider: 'City of Riverside',
      cadence: 'annual',
      payerMemberId: alex.id,
      colour: '#4f8a3a',
    },
    db,
  );
  // Alex's own car rego: only Alex sees it, and it stays out of the household's figures.
  const rego = createService(
    hh.id,
    {
      typeSlug: 'vehicle_registration',
      name: 'Car rego',
      provider: 'Transport Registry',
      cadence: 'annual',
      ownerMemberId: alex.id,
      colour: '#e87ba4',
    },
    db,
  );

  /**
   * Which housemate shares are paid back to the payer: everything due before
   * 20 Sep 2026 two days early, with the studio's exceptions on the newest bills.
   */
  const overrides: Record<string, Partial<Record<Who, string | null>>> = {
    'power-2026-q3': { alex: null, sam: null },
    'gas-2026-07': { alex: '2026-09-21', sam: null },
    'rates-2026#1': { jordan: '2026-09-25', sam: null },
  };
  const sharePaidOn = (key: string, due: string, member: Who): string | null => {
    const o = overrides[key];
    if (o && member in o) return o[member] ?? null;
    return due < '2026-09-20' ? addDays(due, -2) : null;
  };
  const byId = new Map(Object.entries(who).map(([k, v]) => [v, k as Who]));
  const settleShares = (billId: string, key: string) => {
    const b = getBill(hh.id, billId, db)!;
    for (const s of b.shares) {
      if (s.paidMethod === 'payer' || s.paidAt) continue;
      const member = byId.get(s.memberId)!;
      const seq = s.instalment;
      const due = seq
        ? (b.instalments.find((i) => i.seq === seq)?.dueDate ?? b.dueDate)
        : b.dueDate;
      const on = sharePaidOn(seq ? `${key}#${seq}` : key, due, member);
      if (on) setSharePaid(hh.id, s.id, true, { method: 'transfer', paidAt: at(on) }, db);
    }
  };

  const bills = new Map<string, { id: string; serviceId: string }>();
  const add = (
    key: string,
    serviceId: string,
    b: Omit<BillInput, 'serviceId' | 'source'> & { paid?: string | null },
  ) => {
    const { paid, ...rest } = b;
    const created = createBill(
      hh.id,
      { ...rest, serviceId, source: 'manual', paidToProviderAt: paid ? at(paid) : null },
      db,
    );
    settleShares(created.id, key);
    bills.set(key, created);
    return created;
  };

  // Rent and internet: monthly, Oct 2025 → Oct 2026.
  for (let i = 0; i < 13; i++) {
    const y = 2025 + Math.floor((9 + i) / 12);
    const m = ((9 + i) % 12) + 1;
    const from = `${y}-${mm(m)}-01`;
    const to = monthEnd(y, m);
    add(`rent-${y}-${mm(m)}`, rent.id, {
      amountMinor: 229667,
      periodStart: from,
      periodEnd: to,
      issueDate: addDays(from, -7),
      dueDate: from,
      externalRef: `HL-RIV-${y}${mm(m)}`,
      paid: from < TODAY ? addDays(from, -1) : null,
    });
    const netDue = `${y}-${mm(m)}-04`;
    add(`net-${y}-${mm(m)}`, net.id, {
      amountMinor: from >= '2026-07-01' ? 8900 : 8500,
      periodStart: from,
      periodEnd: to,
      issueDate: addDays(from, -4),
      dueDate: netDue,
      externalRef: `BB-88213-${y}${mm(m)}`,
      paid: netDue < TODAY ? addDays(netDue, -1) : null,
    });
  }

  // Electricity: quarterly.
  for (const [k, from, to, issued, due, amount, usage] of [
    ['2025-q3', '2025-06-01', '2025-08-31', '2025-09-06', '2025-09-26', 46290, 1602],
    ['2025-q4', '2025-09-01', '2025-11-30', '2025-12-06', '2025-12-28', 41255, 1455],
    ['2026-q1', '2025-12-01', '2026-02-28', '2026-03-07', '2026-03-27', 39812, 1398],
    ['2026-q2', '2026-03-01', '2026-05-31', '2026-06-06', '2026-06-26', 44170, 1512],
    ['2026-q3', '2026-06-01', '2026-08-31', '2026-09-08', '2026-09-30', 48621, 1684],
  ] as const)
    add(`power-${k}`, power.id, {
      amountMinor: amount,
      taxMinor: Math.round(amount / 11),
      taxLabel: 'GST',
      periodStart: from,
      periodEnd: to,
      issueDate: issued,
      dueDate: due,
      usageQuantity: usage,
      usageUnit: 'kWh',
      externalRef: `NW-4471-${issued.slice(0, 7).replace('-', '')}`,
      paid: due < TODAY ? addDays(due, -4) : null,
    });

  // Gas: every two months.
  for (const [k, from, to, issued, due, amount, usage] of [
    ['2025-07', '2025-07-01', '2025-08-31', '2025-09-04', '2025-09-25', 24120, 7760],
    ['2025-09', '2025-09-01', '2025-10-31', '2025-11-04', '2025-11-25', 14280, 4120],
    ['2025-11', '2025-11-01', '2025-12-31', '2026-01-06', '2026-01-27', 9640, 2310],
    ['2026-01', '2026-01-01', '2026-02-28', '2026-03-04', '2026-03-25', 8820, 1980],
    ['2026-03', '2026-03-01', '2026-04-30', '2026-05-05', '2026-05-26', 12135, 3050],
    ['2026-05', '2026-05-01', '2026-06-30', '2026-07-03', '2026-07-24', 25410, 7860],
    ['2026-07', '2026-07-01', '2026-08-31', '2026-09-03', '2026-09-24', 31844, 10240],
  ] as const)
    add(`gas-${k}`, gas.id, {
      amountMinor: amount,
      periodStart: from,
      periodEnd: to,
      issueDate: issued,
      dueDate: due,
      usageQuantity: usage,
      usageUnit: 'MJ',
      externalRef: `HG-20-5531-${issued.slice(2, 7).replace('-', '')}`,
      paid: k === '2026-07' ? '2026-09-20' : due < TODAY ? addDays(due, -3) : null,
    });

  // Water: quarterly.
  for (const [k, from, to, issued, due, amount, usage] of [
    ['2025-q3', '2025-07-01', '2025-09-30', '2025-10-12', '2025-11-03', 26810, 35],
    ['2025-q4', '2025-10-01', '2025-12-31', '2026-01-12', '2026-02-02', 27940, 38],
    ['2026-q1', '2026-01-01', '2026-03-31', '2026-04-12', '2026-05-04', 30112, 44],
    ['2026-q2', '2026-04-01', '2026-06-30', '2026-07-12', '2026-08-03', 28735, 36],
  ] as const)
    add(`water-${k}`, water.id, {
      amountMinor: amount,
      periodStart: from,
      periodEnd: to,
      issueDate: issued,
      dueDate: due,
      usageQuantity: usage,
      usageUnit: 'kL',
      externalRef: `RW-100482-${issued.slice(0, 7).replace('-', '')}`,
      paid: addDays(due, -6),
    });

  // Council rates: yearly notices, paid by instalments. Last year's are all
  // paid; this year's first is due 30 Sep and Jordan has paid Alex back for it.
  const notice = (
    key: string,
    ref: string,
    from: string,
    to: string,
    issued: string,
    fullDue: string,
    full: number,
    each: number,
    dues: string[],
    paidOn: (string | null)[],
  ) => {
    const b = createBill(
      hh.id,
      {
        serviceId: rates.id,
        amountMinor: full,
        periodStart: from,
        periodEnd: to,
        issueDate: issued,
        dueDate: fullDue,
        source: 'manual',
        externalRef: ref,
        instalments: dues.map((dueDate) => ({ dueDate, amountMinor: each })),
      },
      db,
    );
    setPaymentPlan(hh.id, b.id, 'instalments', db, TODAY);
    paidOn.forEach((on, i) => {
      if (on) setInstalmentPaid(hh.id, b.id, i + 1, true, db, at(on));
    });
    settleShares(b.id, key);
    bills.set(key, b);
  };
  notice(
    'rates-2025',
    'Assessment 30114-0 · 2025–26',
    '2025-07-01',
    '2026-06-30',
    '2025-08-12',
    '2025-09-30',
    209600,
    52400,
    ['2025-09-30', '2025-11-30', '2026-02-28', '2026-05-31'],
    ['2025-09-26', '2025-11-27', '2026-02-25', '2026-05-28'],
  );
  notice(
    'rates-2026',
    'Assessment 30114-0 · 2026–27',
    '2026-07-01',
    '2027-06-30',
    '2026-08-14',
    '2026-09-30',
    218400,
    54600,
    ['2026-09-30', '2026-11-30', '2027-02-28', '2027-05-31'],
    [null, null, null, null],
  );

  // Alex's own car rego (personal: no shares).
  add('rego-2025', rego.id, {
    amountMinor: 88410,
    periodStart: '2025-10-18',
    periodEnd: '2026-10-17',
    issueDate: '2025-09-20',
    dueDate: '2025-10-18',
    externalRef: 'REG 1KX-4PL · 2025',
    paid: '2025-10-10',
  });
  add('rego-2026', rego.id, {
    amountMinor: 91240,
    periodStart: '2026-10-18',
    periodEnd: '2027-10-17',
    issueDate: '2026-09-19',
    dueDate: '2026-10-18',
    externalRef: 'REG 1KX-4PL · 2026',
    paid: null,
  });

  await seedDocuments(
    hh.id,
    { alex, jordan },
    { power, gas, water, net, rates, rego, rent },
    bills,
    db,
  );
  return { household: hh.name, members: 3 };
}

/**
 * The documents behind the bills, as the studio shows them: each bill's PDF
 * (drawn here, so the bill page has a real first page), how it arrived, a
 * receipt, and the Inbox's waiting, unreadable, to-confirm and other items.
 * Bills entered by hand (rent) have no document.
 */
async function seedDocuments(
  householdId: string,
  people: { alex: Member; jordan: Member },
  svc: Record<'power' | 'gas' | 'water' | 'net' | 'rates' | 'rego' | 'rent', Service>,
  bills: Map<string, { id: string; serviceId: string }>,
  db: Db,
) {
  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib');
  const sharp = (await import('sharp')).default;
  const domains: Partial<Record<string, string>> = {
    [svc.power.id]: 'northwind.energy',
    [svc.gas.id]: 'hearthline.com.au',
    [svc.water.id]: 'riverbend.water',
    [svc.net.id]: 'brightline.net.au',
  };
  const pdf = async (lines: string[]) => {
    const doc = await PDFDocument.create();
    const page = doc.addPage([595, 842]);
    const bold = await doc.embedFont(StandardFonts.HelveticaBold);
    const font = await doc.embedFont(StandardFonts.Helvetica);
    let y = 780;
    lines.forEach((line, i) => {
      page.drawText(line, {
        x: 56,
        y,
        size: i === 0 ? 22 : i === 2 ? 30 : 12,
        font: i === 0 || i === 2 ? bold : font,
        color: rgb(0.13, 0.15, 0.18),
      });
      y -= i === 0 ? 40 : i === 1 ? 44 : i === 2 ? 48 : 22;
    });
    page.drawRectangle({ x: 56, y: 60, width: 483, height: 1, color: rgb(0.8, 0.8, 0.8) });
    return Buffer.from(await doc.save());
  };
  const store = (
    id: string,
    status: 'extracted' | 'needs_review' | 'unprocessed' | 'ignored' | 'notice',
    x: Partial<StoredExtraction> & { documentDate?: string },
  ) => {
    const json: StoredExtraction = {
      result: null,
      attempts: [{ extractor: 'llm:anthropic', confidence: 0.96 }],
      reason: '',
      textPreview: '',
      processedAt: at(TODAY),
      ...x,
    };
    db.update(sourceDocument)
      .set({ status, extractionJson: JSON.stringify(json) })
      .where(eq(sourceDocument.id, id))
      .run();
  };
  const money = (minor: number) =>
    new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(minor / 100);
  const billRows = db.select().from(bill).where(eq(bill.householdId, householdId)).all();
  const byId = new Map(billRows.map((b) => [b.id, b]));
  const services = new Map(Object.values(svc).map((x) => [x.id, x]));

  for (const [key, ref] of bills) {
    const b = byId.get(ref.id)!;
    const service = services.get(b.serviceId)!;
    if (service.id === svc.rent.id) continue;
    const domain = domains[service.id];
    const scan = service.id === svc.rates.id || service.id === svc.rego.id;
    const forwarded = service.id === svc.power.id;
    const what =
      service.id === svc.rates.id
        ? 'Rates notice'
        : service.id === svc.rego.id
          ? 'Renewal notice'
          : 'Tax invoice';
    const buffer = await pdf([
      service.provider,
      what,
      money(b.fullAmountMinor ?? b.amountMinor),
      `Amount due by ${b.fullDueDate ?? b.dueDate}`,
      `Period ${b.periodStart} to ${b.periodEnd}`,
      `Reference ${b.externalRef ?? ''}`,
      `Issued ${b.issueDate ?? ''}`,
    ]);
    const issued = b.issueDate ?? b.periodStart;
    const { doc } = archiveDocument(
      householdId,
      {
        kind: scan ? 'upload' : 'pdf',
        buffer,
        originalFilename: `${service.provider.split(' ')[0]} ${new Date(`${issued}T00:00:00Z`).toLocaleString('en-AU', { month: 'short', year: 'numeric', timeZone: 'UTC' })}.pdf`,
        mimeType: 'application/pdf',
        receivedAt: at(issued),
        emailFrom: scan
          ? null
          : forwarded
            ? people.jordan.email
            : domain
              ? `accounts@${domain}`
              : null,
        emailSubject: scan ? null : `Your ${service.name.toLowerCase()} bill is ready`,
        senderDomain: scan ? null : forwarded ? null : (domain ?? null),
        senderVerified: scan ? null : true,
        memberId: scan ? people.alex.id : forwarded ? people.jordan.id : null,
      },
      db,
    );
    db.update(bill)
      .set({
        sourceDocumentId: doc.id,
        source: 'llm',
        extractor: 'llm:anthropic',
        confidence: 0.96,
      })
      .where(eq(bill.id, b.id))
      .run();
    store(doc.id, 'extracted', {
      result: {
        extractor: 'llm:anthropic',
        confidence: 0.96,
        warnings: [],
        bill: {
          provider: service.provider,
          serviceType: service.typeSlug,
          amountMinor: b.fullAmountMinor ?? b.amountMinor,
          currency: 'AUD',
          periodStart: b.periodStart,
          periodEnd: b.periodEnd,
          dueDate: b.fullDueDate ?? b.dueDate,
          externalRef: b.externalRef,
        },
      },
      code: 'created',
      reason: 'Created bill via llm:anthropic',
      documentDate: issued,
    });
    void key;
  }

  // A payment receipt for the latest gas bill, forwarded by Jordan.
  const gasNow = bills.get('gas-2026-07')!;
  const receipt = archiveDocument(
    householdId,
    {
      kind: 'email',
      buffer: Buffer.from(
        'From: noreply@hearthline.com.au\nSubject: Thanks, we received your payment\n\nThanks, we received your payment of $318.44 on 20 September 2026.\n',
      ),
      originalFilename: 'Payment received.eml',
      mimeType: 'message/rfc822',
      receivedAt: at('2026-09-20'),
      emailFrom: 'noreply@hearthline.com.au',
      emailSubject: 'Thanks, we received your payment',
      senderDomain: 'hearthline.com.au',
      senderVerified: true,
      memberId: people.jordan.id,
    },
    db,
  ).doc;
  store(receipt.id, 'notice', {
    code: 'receipt',
    reason: 'Payment receipt for Hearthline Gas, $318.44',
    billId: gasNow.id,
    documentDate: '2026-09-20',
  });

  // Still waiting: a water bill that arrived today.
  const waiting = archiveDocument(
    householdId,
    {
      kind: 'pdf',
      buffer: await pdf([
        'Riverbend Water',
        'Tax invoice',
        money(29840),
        'Amount due by 2026-11-02',
        'Period 2026-07-01 to 2026-09-30',
      ]),
      originalFilename: 'Riverbend Sep 2026.pdf',
      mimeType: 'application/pdf',
      receivedAt: at(TODAY),
      emailFrom: 'accounts@riverbend.water',
      emailSubject: 'Your water bill is ready',
      senderDomain: 'riverbend.water',
      senderVerified: true,
    },
    db,
  ).doc;
  void waiting;

  // A photo nothing could be made out of, uploaded by Jordan.
  const photo = archiveDocument(
    householdId,
    {
      kind: 'upload',
      buffer: await sharp({
        create: { width: 900, height: 1200, channels: 3, background: '#d9d4cc' },
      })
        .jpeg({ quality: 60 })
        .toBuffer(),
      originalFilename: 'IMG_2231.jpg',
      mimeType: 'image/jpeg',
      receivedAt: at('2026-09-28'),
      memberId: people.jordan.id,
    },
    db,
  ).doc;
  store(photo.id, 'needs_review', {
    result: null,
    attempts: [{ extractor: 'llm:anthropic', confidence: 0 }],
    reason: 'Nothing on this document could be made out',
    code: 'no-result',
  });

  // A rent statement with one detail to confirm, uploaded by Alex.
  const statement = archiveDocument(
    householdId,
    {
      kind: 'upload',
      buffer: await pdf([
        'Harbour Lane Realty',
        'Statement',
        money(229667),
        'For October 2026',
        'Reference HL-RIV-202610',
      ]),
      originalFilename: 'Statement Sep 2026.pdf',
      mimeType: 'application/pdf',
      receivedAt: at('2026-09-26'),
      memberId: people.alex.id,
    },
    db,
  ).doc;
  store(statement.id, 'needs_review', {
    result: {
      extractor: 'llm:anthropic',
      confidence: 0.7,
      warnings: [],
      bill: {
        provider: 'Harbour Lane Realty',
        serviceType: 'rent',
        amountMinor: 229667,
        currency: 'AUD',
        periodStart: '2026-10-01',
        periodEnd: '2026-10-31',
        dueDate: '',
        externalRef: 'HL-RIV-202610',
        serviceId: svc.rent.id,
      },
    },
    reason: 'Some details need checking',
    code: 'low-confidence',
    documentDate: '2026-09-26',
  });

  // Something else from a provider: an account update, filed under Other.
  const other = archiveDocument(
    householdId,
    {
      kind: 'email',
      buffer: Buffer.from(
        'From: hello@riverbend.water\nSubject: Your online account has a new look\n\nWe have refreshed your online account.\n',
      ),
      originalFilename: 'Account update.eml',
      mimeType: 'message/rfc822',
      receivedAt: at('2026-09-15'),
      emailFrom: 'hello@riverbend.water',
      emailSubject: 'Your online account has a new look',
      senderDomain: 'riverbend.water',
      senderVerified: true,
    },
    db,
  ).doc;
  store(other.id, 'ignored', {
    code: 'not-a-bill',
    reason: 'Not a bill',
    documentDate: '2026-09-15',
  });
}
