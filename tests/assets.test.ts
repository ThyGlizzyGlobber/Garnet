import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { openDb, type Db } from '@/db/client';
import { runMigrations } from '@/db/migrate';
import { service, sourceDocument, type Household, type Member } from '@/db/schema';
import { archiveDocument } from '@/ingest/archive';
import { processDocument } from '@/ingest/pipeline';
import { serviceCardsView, subscriptionsView, vehicleView, vehiclesView } from '@/lib/main-view';
import { assetKindOf } from '@/lib/service-categories';
import {
  autoFileBill,
  canEditAsset,
  createAsset,
  deleteAsset,
  fileBillUnder,
  fileWaitingBills,
  getAsset,
  identifierKey,
  refKeys,
  setAssetOwner,
} from '@/lib/assets';
import { filterBills } from '@/lib/bill-search';
import {
  createBill,
  getBill,
  listBills,
  moveBill,
  setServiceOwner,
  setSharePaid,
  type BillInput,
} from '@/lib/bills';
import { createHousehold, getHousehold } from '@/lib/households';
import { createMember, deleteMember } from '@/lib/members';
import { createService, groupServices, listServices, listServiceTypes } from '@/lib/services';
import { shellView } from '@/lib/shell';
import { scriptAi, type AiOutput } from './helpers/fake-ai';

const TODAY = '2026-09-29';
let dir: string;
let db: Db;
let close: () => void;
let n = 0;

beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hud-assets-'));
  runMigrations(dir);
  const opened = openDb(dir);
  db = opened.db;
  close = () => opened.sqlite.close();
});
afterAll(() => {
  close();
  fs.rmSync(dir, { recursive: true, force: true });
});
afterEach(() => scriptAi(null));

/** A fresh household: Mum (admin) and Dad, who split bills. */
function setup() {
  const id = createHousehold(
    {
      name: `Smith ${++n}`,
      currency: 'AUD',
      locale: 'en-AU',
      timezone: 'Australia/Melbourne',
      fiscalYearStartMonth: 7,
      splitMode: 'shared',
    },
    db,
  ).id;
  const hh = getHousehold(id, db)!;
  const mum = createMember(
    id,
    { name: 'Mum', pinHash: 'x', role: 'owner', activeFrom: '2025-01-01' },
    db,
  );
  const dad = createMember(id, { name: 'Dad', pinHash: 'x', activeFrom: '2025-01-01' }, db);
  const svc = (typeSlug: string, provider: string, owner: Member | null = null) =>
    createService(
      id,
      {
        typeSlug,
        name: listServiceTypes(db).find((t) => t.slug === typeSlug)!.label,
        provider,
        cadence: 'annual',
        payerMemberId: owner?.id ?? mum.id,
        ownerMemberId: owner?.id ?? null,
      },
      db,
    );
  return { hh, mum, dad, svc };
}

let seq = 0;
const bill = (hh: Household, serviceId: string, x: Partial<BillInput> = {}) =>
  createBill(
    hh.id,
    {
      serviceId,
      amountMinor: 85000,
      periodStart: '2026-10-01',
      periodEnd: '2027-09-30',
      issueDate: '2026-09-01',
      dueDate: '2026-10-01',
      source: 'manual',
      externalRef: `R-${++seq}`,
      ...x,
    },
    db,
  );

describe('identifiers', () => {
  it('match however they are spaced or punctuated', () => {
    expect(identifierKey(' 1kx-4pl ')).toBe('1KX4PL');
    expect(identifierKey('1KX 4PL')).toBe('1KX4PL');
    expect(identifierKey('ab')).toBeNull();
    expect(refKeys(['1KX-4PL', '1kx 4pl', null, 'x'])).toEqual(['1KX4PL']);
  });
});

describe('Vehicles and Health are main services', () => {
  it('gathers their types under one group each; Subscriptions keep their providers', () => {
    const { hh, mum, svc } = setup();
    svc('electricity', 'Northwind');
    svc('vehicle_registration', 'VicRoads');
    svc('car_insurance', 'RACV');
    svc('health_insurance', 'Bupa');
    svc('ambulance_cover', 'Ambulance Victoria');
    svc('subscriptions', 'Streamly');
    const groups = groupServices(listServices(hh.id, {}, db));
    expect(groups.map((g) => g.category ?? g.typeSlug ?? g.services[0]!.name)).toEqual([
      'Electricity',
      'health',
      'vehicle',
      'subscriptions',
    ]);
    const vehicles = groups.find((g) => g.category === 'vehicle')!;
    expect(vehicles.services.map((s) => s.typeSlug)).toEqual([
      'vehicle_registration',
      'car_insurance',
    ]);
    // The nav: Vehicles → Registration, Car insurance, each showing Vehicles with that kind.
    const nav = shellView(hh, mum, TODAY, db)
      .sections.flatMap((x) => x.entries)
      .find((e) => e.kind === 'group' && e.category === 'vehicle');
    expect(nav?.kind === 'group' && nav.children.map((c) => c.href)).toEqual([
      '/services/category/vehicle',
      '/services/category/vehicle',
    ]);
    expect(nav?.kind === 'group' && nav.href).toBe('/services/category/vehicle');
  });
});

describe('filing bills under a vehicle', () => {
  it('a household vehicle keeps a household bill where it is', () => {
    const { hh, mum, svc } = setup();
    const rego = svc('vehicle_registration', 'VicRoads');
    const b = bill(hh, rego.id);
    const fiesta = createAsset(hh.id, { kind: 'vehicle', name: 'Ford Fiesta 2011' }, db);
    const filed = fileBillUnder(hh.id, b.id, { assetId: fiesta.id }, { me: mum }, db);
    expect(filed.serviceId).toBe(rego.id);
    expect(filed.asset?.name).toBe('Ford Fiesta 2011');
    expect(filed.shares.length).toBe(2);
  });

  it("moves a bill to someone's own vehicle onto their own service of the same type", () => {
    const { hh, dad, svc } = setup();
    const rego = svc('vehicle_registration', 'VicRoads');
    const b = bill(hh, rego.id, { createdByMemberId: dad.id });
    const ute = createAsset(
      hh.id,
      { kind: 'vehicle', name: 'Ute', ownerMemberId: dad.id, createdByMemberId: dad.id },
      db,
    );
    const filed = fileBillUnder(hh.id, b.id, { assetId: ute.id }, { me: dad }, db);
    expect(filed.serviceId).not.toBe(rego.id);
    expect(filed.service.typeSlug).toBe('vehicle_registration');
    expect(filed.service.provider).toBe('VicRoads');
    expect([filed.ownerMemberId, filed.service.ownerMemberId]).toEqual([dad.id, dad.id]);
    expect(filed.shares).toEqual([]);
    // Set up by the vehicle, so nobody is asked "Who's this for?".
    expect(filed.service.ownerAskedAt).toBeNull();
    // A second bill for the same car reuses that service.
    const again = fileBillUnder(
      hh.id,
      bill(hh, rego.id, { createdByMemberId: dad.id }).id,
      { assetId: ute.id },
      { me: dad },
      db,
    );
    expect(again.serviceId).toBe(filed.serviceId);
  });

  it("won't take a bill someone else brought in out of the household", () => {
    const { hh, mum, dad, svc } = setup();
    const rego = svc('vehicle_registration', 'VicRoads');
    const b = bill(hh, rego.id, { createdByMemberId: dad.id });
    const mine = createAsset(
      hh.id,
      { kind: 'vehicle', name: 'Mum’s car', ownerMemberId: mum.id, createdByMemberId: mum.id },
      db,
    );
    expect(() => fileBillUnder(hh.id, b.id, { assetId: mine.id }, { me: mum }, db)).toThrow(
      /brought this bill in/,
    );
    expect(getBill(hh.id, b.id, db)!.serviceId).toBe(rego.id);
    // Nor file anything under a vehicle it can't see.
    expect(() => fileBillUnder(hh.id, b.id, { assetId: mine.id }, { me: dad }, db)).toThrow(
      /Not found/,
    );
  });

  it('moves a rego notice filed under insurance to Registration and the car in one step', () => {
    const { hh, mum, svc } = setup();
    const insurance = svc('building_insurance', 'VicRoads');
    const b = bill(hh, insurance.id);
    const fiesta = createAsset(hh.id, { kind: 'vehicle', name: 'Ford Fiesta 2011' }, db);
    const filed = fileBillUnder(
      hh.id,
      b.id,
      { assetId: fiesta.id, typeSlug: 'vehicle_registration' },
      { me: mum },
      db,
    );
    expect(filed.service.typeSlug).toBe('vehicle_registration');
    expect(filed.service.name).toBe('Vehicle Registration');
    expect(filed.assetId).toBe(fiesta.id);
    expect(listBills(hh.id, { serviceId: insurance.id }, db)).toEqual([]);
  });

  it('refuses a vehicle on a health bill, and a failed move leaves no empty service', () => {
    const { hh, mum, dad, svc } = setup();
    const cover = svc('health_insurance', 'Bupa');
    const fiesta = createAsset(hh.id, { kind: 'vehicle', name: 'Fiesta' }, db);
    const b = bill(hh, cover.id);
    expect(() => fileBillUnder(hh.id, b.id, { assetId: fiesta.id }, { me: mum }, db)).toThrow(
      /vehicle bills/,
    );
    // Dad has paid his share: it can't leave the household.
    const rego = svc('vehicle_registration', 'VicRoads');
    const paid = bill(hh, rego.id, { createdByMemberId: mum.id });
    setSharePaid(hh.id, paid.shares.find((s) => s.memberId === dad.id)!.id, true, {}, db);
    const mine = createAsset(hh.id, { kind: 'vehicle', name: 'Mine', ownerMemberId: mum.id }, db);
    const before = listServices(hh.id, { everyone: true, includeInactive: true }, db).length;
    expect(() => fileBillUnder(hh.id, paid.id, { assetId: mine.id }, { me: mum }, db)).toThrow(
      /stays with the household/,
    );
    expect(listServices(hh.id, { everyone: true, includeInactive: true }, db).length).toBe(before);
  });

  it('a bill moved to another kind of service, or switched sides, loses its vehicle', () => {
    const { hh, mum, svc } = setup();
    const rego = svc('vehicle_registration', 'VicRoads');
    const power = svc('electricity', 'Northwind');
    const fiesta = createAsset(hh.id, { kind: 'vehicle', name: 'Fiesta' }, db);
    const a = bill(hh, rego.id, { assetId: fiesta.id });
    const b = bill(hh, rego.id, { assetId: fiesta.id });
    expect(getBill(hh.id, a.id, db)!.assetId).toBe(fiesta.id);
    moveBill(hh.id, a.id, power.id, db);
    expect(getBill(hh.id, a.id, db)!.assetId).toBeNull();
    setServiceOwner(hh.id, rego.id, mum.id, db);
    expect(getBill(hh.id, b.id, db)!.assetId).toBeNull();
    // A new bill given a vehicle that doesn't fit its service doesn't keep it.
    const c = bill(hh, power.id, { assetId: fiesta.id });
    expect(c.assetId).toBeNull();
  });
});

describe('whose a vehicle is', () => {
  it('moves its bills with it, and back', () => {
    const { hh, mum, svc } = setup();
    const rego = svc('vehicle_registration', 'VicRoads');
    const car = createAsset(
      hh.id,
      { kind: 'vehicle', name: 'Fiesta', createdByMemberId: mum.id },
      db,
    );
    const b = bill(hh, rego.id, { assetId: car.id, createdByMemberId: mum.id });
    setAssetOwner(hh.id, car.id, mum.id, mum, db);
    let now = getBill(hh.id, b.id, db)!;
    expect([now.ownerMemberId, now.assetId, now.shares.length]).toEqual([mum.id, car.id, 0]);
    setAssetOwner(hh.id, car.id, null, mum, db);
    now = getBill(hh.id, b.id, db)!;
    expect([now.ownerMemberId, now.serviceId, now.shares.length]).toEqual([null, rego.id, 2]);
  });

  it('is refused, changing nothing, once a housemate has paid a share', () => {
    const { hh, mum, dad, svc } = setup();
    const rego = svc('vehicle_registration', 'VicRoads');
    const car = createAsset(hh.id, { kind: 'vehicle', name: 'Fiesta' }, db);
    const b = bill(hh, rego.id, { assetId: car.id, createdByMemberId: mum.id });
    setSharePaid(hh.id, b.shares.find((s) => s.memberId === dad.id)!.id, true, {}, db);
    expect(() => setAssetOwner(hh.id, car.id, mum.id, mum, db)).toThrow(/paid shares/);
    expect(getAsset(hh.id, car.id, db)!.ownerMemberId).toBeNull();
  });

  it('can be changed by its owner, an admin or whoever added it', () => {
    const { mum, dad } = setup();
    expect(canEditAsset(dad, { ownerMemberId: null, createdByMemberId: mum.id })).toBe(false);
    expect(canEditAsset(dad, { ownerMemberId: null, createdByMemberId: dad.id })).toBe(true);
    expect(canEditAsset(mum, { ownerMemberId: null, createdByMemberId: dad.id })).toBe(true);
    expect(canEditAsset(mum, { ownerMemberId: dad.id, createdByMemberId: dad.id })).toBe(false);
  });

  it('keeps a member with their own vehicle from being deleted; removing one keeps its bills', () => {
    const { hh, dad, svc } = setup();
    const car = createAsset(hh.id, { kind: 'vehicle', name: 'Ute', ownerMemberId: dad.id }, db);
    expect(() => deleteMember(hh.id, dad.id, db)).toThrow(/vehicles or policies/);
    const rego = svc('vehicle_registration', 'VicRoads', dad);
    const b = bill(hh, rego.id, { assetId: car.id });
    deleteAsset(hh.id, car.id, db);
    expect(getBill(hh.id, b.id, db)!.assetId).toBeNull();
  });
});

describe('matching by plate', () => {
  const regoNotice = (refs: string[]): AiOutput => ({
    document_type: 'bill',
    provider: 'VicRoads',
    document_date: '2026-09-01',
    service_type: 'vehicle_registration',
    bill: {
      amount: 850,
      currency: 'AUD',
      tax_amount: null,
      tax_label: null,
      period_start: '2026-10-01',
      period_end: '2027-09-30',
      issue_date: '2026-09-01',
      due_date: '2026-10-01',
      usage_quantity: null,
      usage_unit: null,
      invoice_number: `N-${++seq}`,
      account_number: null,
      asset_refs: refs,
      auto_pay: false,
      previous_payment: null,
      metrics: [],
      instalments: null,
    },
    payment: null,
    page_rotation: [],
    confidence: 0.95,
    notes: null,
  });
  const upload = (hid: string, memberId: string, text = 'A rego notice long enough to look at') =>
    archiveDocument(
      hid,
      {
        kind: 'upload',
        buffer: Buffer.from(`${text} ${Math.random()}`),
        originalFilename: 'notice.txt',
        mimeType: 'text/plain',
        memberId,
      },
      db,
    ).doc;

  it("files a new bill under the car whose plate it prints, on the car's side", async () => {
    const { hh, mum } = setup();
    const fiesta = createAsset(
      hh.id,
      { kind: 'vehicle', name: 'Ford Fiesta 2011', identifier: 'ABC-123' },
      db,
    );
    createAsset(hh.id, { kind: 'vehicle', name: 'Corolla', identifier: 'XYZ 789' }, db);
    scriptAi(regoNotice(['abc 123']));
    // Rego from a member is guessed to be theirs; the household's car says otherwise.
    const outcome = await processDocument(hh.id, upload(hh.id, mum.id).id, db);
    expect(outcome.status).toBe('extracted');
    const b = getBill(hh.id, outcome.billId!, db)!;
    expect(b.assetId).toBe(fiesta.id);
    expect(b.ownerMemberId).toBeNull();
    expect(b.shares.length).toBe(2);
    expect(b.assetRefs).toEqual(['ABC123']);
    // The personal service set up for it was left empty, so it went again.
    expect(listServices(hh.id, { owner: mum.id, includeInactive: true }, db)).toEqual([]);
  });

  it('leaves a bill waiting when no plate matches, and autoFileBill does nothing more', async () => {
    const { hh, mum } = setup();
    createAsset(hh.id, { kind: 'vehicle', name: 'Fiesta', identifier: 'ABC123' }, db);
    scriptAi(regoNotice(['QQQ111']));
    const outcome = await processDocument(hh.id, upload(hh.id, mum.id).id, db);
    const b = getBill(hh.id, outcome.billId!, db)!;
    expect(b.assetId).toBeNull();
    expect(autoFileBill(hh.id, b.id, { viewer: mum.id }, db)).toBeNull();
  });

  it('adding a vehicle files the waiting bills that print its plate', () => {
    const { hh, mum, svc } = setup();
    const rego = svc('vehicle_registration', 'VicRoads');
    const noted = bill(hh, rego.id, { assetRefs: ['ABC123'] });
    // Analysed before plates were noted: its document's text shows it.
    const doc = upload(hh.id, mum.id);
    db.update(sourceDocument)
      .set({ extractionJson: JSON.stringify({ textPreview: 'Registration ABC 123 Ford' }) })
      .where(eq(sourceDocument.id, doc.id))
      .run();
    const older = bill(hh, rego.id, { sourceDocumentId: doc.id });
    const other = bill(hh, rego.id, { assetRefs: ['XYZ789'] });
    const fiesta = createAsset(
      hh.id,
      { kind: 'vehicle', name: 'Fiesta', identifier: 'abc123' },
      db,
    );
    expect(fileWaitingBills(hh.id, fiesta, mum, db)).toBe(2);
    expect(getBill(hh.id, noted.id, db)!.assetId).toBe(fiesta.id);
    expect(getBill(hh.id, older.id, db)!.assetId).toBe(fiesta.id);
    expect(getBill(hh.id, other.id, db)!.assetId).toBeNull();
  });
});

describe('the pages', () => {
  it('Vehicles shows every vehicle with its own figures, and all of them together', () => {
    const { hh, mum, dad, svc } = setup();
    const rego = svc('vehicle_registration', 'VicRoads');
    const insure = svc('car_insurance', 'RACV');
    const fiesta = createAsset(hh.id, { kind: 'vehicle', name: 'Fiesta' }, db);
    const ute = createAsset(hh.id, { kind: 'vehicle', name: 'Ute' }, db);
    createAsset(hh.id, { kind: 'vehicle', name: 'Dad’s bike', ownerMemberId: dad.id }, db);
    // Due 1 Oct 2025 and 1 Oct 2026 (TODAY is 29 Sep 2026): only the first is in the last year.
    bill(hh, rego.id, {
      assetId: fiesta.id,
      periodStart: '2025-10-01',
      periodEnd: '2026-09-30',
      dueDate: '2025-10-01',
      amountMinor: 80000,
      paidToProviderAt: '2025-09-28T00:00:00.000Z',
    });
    bill(hh, rego.id, { assetId: fiesta.id });
    bill(hh, insure.id, {
      assetId: fiesta.id,
      amountMinor: 60000,
      periodStart: '2026-03-01',
      periodEnd: '2027-02-28',
      dueDate: '2026-03-01',
      paidToProviderAt: '2026-02-20T00:00:00.000Z',
    });
    bill(hh, rego.id);
    const all = vehiclesView(hh, mum, TODAY, db);
    // Dad's own bike is only Dad's to see.
    expect(all.cards.map((c) => [c.asset.name, c.bills.length])).toEqual([
      ['Fiesta', 3],
      ['Ute', 0],
    ]);
    expect(all.waiting).toHaveLength(1);
    const fiestaCard = all.cards[0]!.overview;
    expect(fiestaCard.yearMinor).toBe(80000 + 60000);
    expect(fiestaCard.bySeries.map((s) => [s.key, s.minor])).toEqual([
      ['vehicle_registration', 80000],
      ['car_insurance', 60000],
    ]);
    // The next thing due: this year's rego, due 1 Oct.
    expect(fiestaCard.next).toMatchObject({
      seriesKey: 'vehicle_registration',
      dueDate: '2026-10-01',
    });
    // All of them together: a row per vehicle, the waiting bill counted too.
    expect(all.overview.ahead.rows.map((r) => r.label)).toEqual(['Fiesta', 'Ute']);
    expect(vehiclesView(hh, dad, TODAY, db).cards).toHaveLength(3);
    expect(ute.ownerMemberId).toBeNull();

    // One vehicle's page: a row per kind of bill it has, and who each is with.
    const v = vehicleView(hh, mum, fiesta.id, TODAY, db)!;
    expect(v.kinds.map((k) => [k.type.slug, k.providers, k.count])).toEqual([
      ['vehicle_registration', ['VicRoads'], 2],
      ['car_insurance', ['RACV'], 1],
    ]);
    expect(v.overview.ahead.rows.map((r) => r.key)).toEqual([
      'vehicle_registration',
      'car_insurance',
    ]);
    // The insurance renews next March (expected), the rego is due now.
    const ahead = v.overview.ahead.rows.flatMap((r) =>
      r.items.map((i) => [r.key, i.month, i.expected]),
    );
    expect(ahead).toContainEqual(['vehicle_registration', '2026-10', false]);
    expect(ahead).toContainEqual(['car_insurance', '2027-03', true]);
    expect(vehicleView(hh, dad, 'nope', TODAY, db)).toBeNull();
  });

  it('Health is a card per service holding its bills; no policies', () => {
    const { hh, mum, svc } = setup();
    const bupa = svc('health_insurance', 'Bupa');
    svc('ambulance_cover', 'Ambulance Victoria');
    bill(hh, bupa.id, { amountMinor: 21000 });
    const v = serviceCardsView(hh, mum, { category: 'health' }, TODAY, db);
    expect(v.cards.map((c) => [c.service.provider, c.bills.length])).toEqual([
      ['Bupa', 1],
      ['Ambulance Victoria', 0],
    ]);
    expect(assetKindOf('health')).toBeNull();
  });

  it('Donations and Subscriptions are main services of their own; subscriptions priced a month', () => {
    const { hh, mum, svc } = setup();
    svc('gym', 'Peak Fitness');
    const charity = createService(
      hh.id,
      { typeSlug: 'donations', name: 'Red Cross', provider: 'Red Cross', cadence: 'monthly' },
      db,
    );
    const netflix = createService(
      hh.id,
      { typeSlug: 'subscriptions', name: 'Netflix', provider: 'Netflix', cadence: 'monthly' },
      db,
    );
    const yearly = createService(
      hh.id,
      { typeSlug: 'subscriptions', name: 'Cloud', provider: 'Cloud', cadence: 'annual' },
      db,
    );
    // Recurring from a fixed day, not the clock, so the year ahead is the same every day.
    db.update(service)
      .set({ recurringSince: '2026-08-01T00:00:00.000Z' })
      .where(eq(service.id, netflix.id))
      .run();
    bill(hh, netflix.id, {
      amountMinor: 2299,
      periodStart: '2026-08-05',
      periodEnd: '2026-09-04',
      dueDate: '2026-08-05',
    });
    bill(hh, netflix.id, {
      amountMinor: 2299,
      periodStart: '2026-09-05',
      periodEnd: '2026-10-04',
      dueDate: '2026-09-05',
    });
    bill(hh, yearly.id, {
      amountMinor: 12000,
      periodStart: '2026-01-10',
      periodEnd: '2027-01-09',
      dueDate: '2026-01-10',
    });
    bill(hh, charity.id, { amountMinor: 2500 });
    const groups = groupServices(listServices(hh.id, {}, db));
    expect(groups.find((g) => g.category === 'lifestyle')?.services.map((s) => s.typeSlug)).toEqual(
      ['gym'],
    );
    expect(groups.find((g) => g.typeSlug === 'subscriptions')?.services).toHaveLength(2);
    expect(groups.find((g) => g.typeSlug === 'donations')?.services).toHaveLength(1);
    const donations = serviceCardsView(hh, mum, { typeSlug: 'donations' }, TODAY, db);
    expect(donations.cards.map((c) => c.service.name)).toEqual(['Red Cross']);
    const subs = subscriptionsView(hh, mum, TODAY, db);
    // Each at its own price and how often; a yearly plan stays yearly, never
    // a twelfth. Largest over a year first; the monthly total is the monthly ones.
    expect(
      subs.going.map((l) => [l.service.name, l.each?.amountMinor, l.each?.cadence, l.aYearMinor]),
    ).toEqual([
      ['Netflix', 2299, 'monthly', 27588],
      ['Cloud', 12000, 'annual', 12000],
    ]);
    expect(subs.monthlyMinor).toBe(2299);
    // The year ahead repeats each expected charge by its cadence: Netflix
    // (monthly) through the year, the yearly plan once.
    const marks = (label: string) =>
      subs.overview.ahead.rows.find((r) => r.label === label)?.items.filter((i) => i.expected)
        .length ?? 0;
    expect(marks('Netflix')).toBeGreaterThanOrEqual(11);
    expect(marks('Cloud')).toBe(1);
  });

  it('bills can be found by their vehicle, and filtered to Vehicles', () => {
    const { hh, svc } = setup();
    const rego = svc('vehicle_registration', 'VicRoads');
    const power = svc('electricity', 'Northwind');
    const fiesta = createAsset(
      hh.id,
      { kind: 'vehicle', name: 'Ford Fiesta', identifier: 'ABC123' },
      db,
    );
    bill(hh, rego.id, { assetId: fiesta.id });
    bill(hh, power.id, { periodStart: '2026-07-01', periodEnd: '2026-09-30' });
    const all = listBills(hh.id, {}, db);
    const ctx = { locale: 'en-AU', today: TODAY };
    const found = (f: Parameters<typeof filterBills>[1]) =>
      filterBills(all, { when: 'all', ...f }, ctx).bills.map((b) => b.service.typeSlug);
    expect(found({ q: 'fiesta' })).toEqual(['vehicle_registration']);
    expect(found({ q: 'abc123' })).toEqual(['vehicle_registration']);
    expect(found({ category: 'vehicle' })).toEqual(['vehicle_registration']);
  });
});
