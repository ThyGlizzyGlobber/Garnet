import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { openDb, type Db } from '@/db/client';
import { runMigrations } from '@/db/migrate';
import { archiveDocument } from '@/ingest/archive';
import { processDocument } from '@/ingest/pipeline';
import { linkMember, signInAccount } from '@/lib/accounts';
import {
  createBill,
  getBill,
  listBills,
  setServiceOwner,
  setSharePaid,
  updateBill,
} from '@/lib/bills';
import { devOutbox } from '@/lib/email';
import { createHousehold, updateHousehold } from '@/lib/households';
import { createMember, deleteMember, setMemberRole } from '@/lib/members';
import { notifyBillCreated } from '@/lib/notifications';
import { answerOwnership, canChangeOwner, ownershipQuestions } from '@/lib/ownership';
import { personalSummary } from '@/lib/personal';
import { createService, listServices } from '@/lib/services';
import { dashboardSummary, monthlySeries } from '@/lib/stats';
import { scriptAi, type AiOutput } from './helpers/fake-ai';

let dir: string;
let db: Db;
let close: () => void;

beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hud-personal-'));
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

let n = 0;
/** Jo (admin, pays the power) and Sam share a house; Jo has a personal car rego. */
function setup() {
  const tag = `p${++n}`;
  const hh = createHousehold(
    {
      name: `Personal ${tag}`,
      currency: 'AUD',
      locale: 'en-AU',
      timezone: 'Australia/Melbourne',
      fiscalYearStartMonth: 7,
      splitMode: 'shared',
    },
    db,
  );
  const person = (name: string, role: 'owner' | 'member') => {
    const m = createMember(hh.id, { name, role, activeFrom: '2025-01-01' }, db);
    const a = signInAccount({ email: `${name.toLowerCase()}.${tag}@example.com` }, db);
    linkMember(m.id, a.id, a.email, db);
    return { ...m, email: a.email };
  };
  const jo = person('Jo', 'owner');
  const sam = person('Sam', 'member');
  const power = createService(
    hh.id,
    {
      typeSlug: 'electricity',
      name: 'Electricity',
      provider: 'Example Energy',
      payerMemberId: jo.id,
    },
    db,
  );
  const rego = createService(
    hh.id,
    {
      typeSlug: 'vehicle_registration',
      name: 'Car rego',
      provider: 'Example Roads',
      ownerMemberId: jo.id,
    },
    db,
  );
  const powerBill = createBill(
    hh.id,
    {
      serviceId: power.id,
      amountMinor: 30000, // $300 over September: $150 each
      periodStart: '2026-09-01',
      periodEnd: '2026-09-30',
      dueDate: '2026-10-14',
      source: 'manual',
    },
    db,
  );
  const regoBill = createBill(
    hh.id,
    {
      serviceId: rego.id,
      amountMinor: 36500, // $365 for a year: $1 a day
      periodStart: '2026-07-01',
      periodEnd: '2027-06-30',
      dueDate: '2026-10-01',
      source: 'manual',
    },
    db,
  );
  return { hh, jo, sam, power, rego, powerBill, regoBill };
}

describe('a personal service', () => {
  it('is paid by its owner, not split, and seen only by them', () => {
    const { hh, jo, sam, rego, regoBill } = setup();
    expect(rego.payerMemberId).toBe(jo.id);
    expect(regoBill.ownerMemberId).toBe(jo.id);
    expect(regoBill.shares).toEqual([]);
    const ids = (scope: Parameters<typeof listBills>[1]) =>
      listBills(hh.id, scope, db).map((b) => b.id);
    expect(ids({})).not.toContain(regoBill.id);
    expect(ids({ viewer: jo.id })).toContain(regoBill.id);
    expect(ids({ viewer: sam.id })).not.toContain(regoBill.id);
    expect(listServices(hh.id, { viewer: sam.id }, db).map((s) => s.id)).not.toContain(rego.id);
    // One service's bills are listed for whoever may open that service.
    expect(listBills(hh.id, { serviceId: rego.id }, db)).toHaveLength(1);
  });

  it('stays out of every household figure', () => {
    const { hh } = setup();
    const s = dashboardSummary(hh.id, '2026-09-20', 7, db);
    expect(s.thisMonth.total).toBe(30000);
    expect(s.services.map((x) => x.name)).toEqual(['Electricity']);
    expect([...s.upcoming, ...s.overdue].map((b) => b.service.name)).toEqual(['Electricity']);
    expect(monthlySeries(hh.id, ['2026-09'], db)[0]!.total).toBe(30000);
  });

  it('is only emailed to its owner', async () => {
    const { hh, jo, sam, regoBill } = setup();
    expect(await notifyBillCreated(hh.id, regoBill.id, { db })).toBe(1);
    expect(devOutbox.some((e) => e.to === jo.email && e.subject.includes('Car rego'))).toBe(true);
    expect(devOutbox.some((e) => e.to === sam.email && e.subject.includes('Car rego'))).toBe(false);
  });

  it('keeps its owner from being deleted', () => {
    const { hh } = setup();
    // Moves in later, so has no shares yet: only the personal service stops the delete.
    const kim = createMember(hh.id, { name: 'Kim', activeFrom: '2027-01-01' }, db);
    createService(
      hh.id,
      { typeSlug: 'car_insurance', name: 'Car insurance', provider: 'X', ownerMemberId: kim.id },
      db,
    );
    expect(() => deleteMember(hh.id, kim.id, db)).toThrow(/personal services/);
  });
});

describe('switching a service between household and personal', () => {
  it('moves its bills: personal loses the shares, household splits them again', () => {
    const { hh, sam, power, powerBill } = setup();
    setServiceOwner(hh.id, power.id, sam.id, db);
    let b = getBill(hh.id, powerBill.id, db)!;
    expect([b.ownerMemberId, b.shares.length, b.service.payerMemberId]).toEqual([
      sam.id,
      0,
      sam.id,
    ]);
    setServiceOwner(hh.id, power.id, null, db);
    b = getBill(hh.id, powerBill.id, db)!;
    expect([b.ownerMemberId, b.shares.map((s) => s.amountMinor)]).toEqual([null, [15000, 15000]]);
  });

  it('is refused once a housemate has paid a share', () => {
    const { hh, jo, sam, power, powerBill } = setup();
    const samShare = powerBill.shares.find((s) => s.memberId === sam.id)!;
    setSharePaid(hh.id, samShare.id, true, {}, db);
    expect(() => setServiceOwner(hh.id, power.id, jo.id, db)).toThrow(/paid shares/);
  });

  it('moving a bill onto a personal service makes it personal', () => {
    const { hh, jo, rego, powerBill } = setup();
    const moved = updateBill(hh.id, powerBill.id, { serviceId: rego.id }, db);
    expect([moved.ownerMemberId, moved.shares.length]).toEqual([jo.id, 0]);
    expect(moved.ownerMemberId).toBe(jo.id);
  });
});

describe('the personal dashboard', () => {
  it('adds my shares and my personal bills, apart and together', () => {
    const { hh, jo, sam } = setup();
    const mine = personalSummary(hh.id, jo.id, '2026-09-20', 7, db);
    // September: half the power ($150) + 30 days of rego ($30).
    expect(mine.thisMonth).toEqual({ shares: 15000, personal: 3000, total: 18000 });
    expect(mine.series.at(-1)).toMatchObject({ month: '2026-09', total: 18000 });
    expect(mine.personalServices.map((s) => s.name)).toEqual(['Car rego']);
    expect(mine.upcoming.map((b) => [b.service.name, b.dueMinor])).toEqual([['Car rego', 36500]]);
    expect(mine.byService.map((x) => [x.service.name, x.personal])).toEqual([
      ['Electricity', false],
      ['Car rego', true],
    ]);
    // Sam owes Jo their half; Sam sees none of Jo's personal bills.
    const his = personalSummary(hh.id, sam.id, '2026-09-20', 7, db);
    expect(his.thisMonth).toEqual({ shares: 15000, personal: 0, total: 15000 });
    expect(his.owed).toBe(15000);
    expect(his.upcoming).toEqual([]);
    expect(mine.owedToMe).toBe(15000);
  });
});

describe('bills that arrive', () => {
  const regoNotice = (provider: string, type = 'vehicle_registration'): AiOutput => ({
    document_type: 'bill',
    provider,
    document_date: '2026-09-01',
    service_type: type,
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
      invoice_number: null,
      account_number: null,
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
  const upload = (hid: string, memberId: string) =>
    archiveDocument(
      hid,
      {
        kind: 'upload',
        buffer: Buffer.from(`A document long enough for the reader to look at ${Math.random()}`),
        originalFilename: 'notice.txt',
        mimeType: 'text/plain',
        memberId,
      },
      db,
    ).doc;

  it('car rego from a member becomes their own personal service', async () => {
    const { hh, sam } = setup();
    scriptAi(regoNotice('Other Roads Authority'));
    const outcome = await processDocument(hh.id, upload(hh.id, sam.id).id, db);
    expect(outcome.status).toBe('extracted');
    const b = getBill(hh.id, outcome.billId!, db)!;
    expect([b.ownerMemberId, b.service.ownerMemberId, b.service.payerMemberId]).toEqual([
      sam.id,
      sam.id,
      sam.id,
    ]);
    expect(b.shares).toEqual([]);
  });

  it("never lands on another member's personal service", async () => {
    const { hh, sam, rego } = setup();
    // Jo's rego is with Example Roads; Sam uploads a notice from the same provider.
    scriptAi(regoNotice('Example Roads'));
    const outcome = await processDocument(hh.id, upload(hh.id, sam.id).id, db);
    const b = getBill(hh.id, outcome.billId!, db)!;
    expect(b.serviceId).not.toBe(rego.id);
    expect(b.ownerMemberId).toBe(sam.id);
  });

  it("lands on the uploader's own personal service", async () => {
    const { hh, jo, rego } = setup();
    scriptAi(regoNotice('Example Roads'));
    const outcome = await processDocument(hh.id, upload(hh.id, jo.id).id, db);
    expect(getBill(hh.id, outcome.billId!, db)!.serviceId).toBe(rego.id);
  });

  it("roadside assistance and car insurance are personal; ambulance cover is the household's", async () => {
    const { hh, sam } = setup();
    const owner = async (provider: string, type: string) => {
      scriptAi(regoNotice(provider, type));
      const outcome = await processDocument(hh.id, upload(hh.id, sam.id).id, db);
      return getBill(hh.id, outcome.billId!, db)!.service.ownerMemberId;
    };
    expect(await owner('Example Roadside Club', 'roadside_assistance')).toBe(sam.id);
    expect(await owner('Example Car Insurer', 'car_insurance')).toBe(sam.id);
    expect(await owner('Example Ambulance', 'ambulance_cover')).toBeNull();
    expect(await owner('Example Fitness', 'gym')).toBe(sam.id);
    expect(await owner('Example Mechanics', 'vehicle_maintenance')).toBe(sam.id);
  });

  it('household kinds of bill stay household services', async () => {
    const { hh, sam } = setup();
    scriptAi(regoNotice('Example Water', 'water'));
    const outcome = await processDocument(hh.id, upload(hh.id, sam.id).id, db);
    const b = getBill(hh.id, outcome.billId!, db)!;
    expect([b.ownerMemberId, b.service.ownerMemberId, b.shares.length]).toEqual([null, null, 2]);
  });
});

describe('admins', () => {
  it('can make another member an admin, and a household keeps at least one', () => {
    const { hh, jo, sam } = setup();
    expect(setMemberRole(hh.id, sam.id, 'owner', db).role).toBe('owner');
    // Two admins: either can step down.
    expect(setMemberRole(hh.id, jo.id, 'member', db).role).toBe('member');
    expect(() => setMemberRole(hh.id, sam.id, 'member', db)).toThrow(/at least one admin/);
    expect(() => deleteMember(hh.id, sam.id, db)).toThrow(/admin/);
  });
});

describe('who a new service is for', () => {
  const water = (): AiOutput => ({
    ...regoNoticeFor('Example Water', 'water'),
  });
  function regoNoticeFor(provider: string, type: string): AiOutput {
    return {
      document_type: 'bill',
      provider,
      document_date: '2026-09-01',
      service_type: type,
      bill: {
        amount: 120,
        currency: 'AUD',
        tax_amount: null,
        tax_label: null,
        period_start: '2026-07-01',
        period_end: '2026-09-30',
        issue_date: '2026-09-01',
        due_date: '2026-10-01',
        usage_quantity: null,
        usage_unit: null,
        invoice_number: null,
        account_number: null,
        auto_pay: false,
        previous_payment: null,
        metrics: [],
        instalments: null,
      },
      payment: null,
      page_rotation: [],
      confidence: 0.95,
      notes: null,
    };
  }
  const uploadAs = async (hid: string, memberId: string, answer: AiOutput) => {
    scriptAi(answer);
    const doc = archiveDocument(
      hid,
      {
        kind: 'upload',
        buffer: Buffer.from(`A document long enough for the reader to look at ${Math.random()}`),
        originalFilename: 'notice.txt',
        mimeType: 'text/plain',
        memberId,
      },
      db,
    ).doc;
    return (await processDocument(hid, doc.id, db)).billId!;
  };

  it('is asked of whoever brought the bill in, once', async () => {
    const { hh, jo, sam } = setup();
    const billId = await uploadAs(hh.id, sam.id, water());
    const svc = getBill(hh.id, billId, db)!.service;
    // Household by its type, but Sam is asked; Jo isn't.
    expect(svc.ownerMemberId).toBeNull();
    expect(ownershipQuestions(hh.id, sam, db).map((q) => [q.service.id, q.billId])).toEqual([
      [svc.id, billId],
    ]);
    expect(ownershipQuestions(hh.id, jo, db)).toEqual([]);

    // Sam says it's theirs: it becomes Sam's, unsplit, and isn't asked again.
    expect(answerOwnership(hh.id, svc.id, sam, 'mine', db).ok).toBe(true);
    const b = getBill(hh.id, billId, db)!;
    expect([b.ownerMemberId, b.shares.length]).toEqual([sam.id, 0]);
    expect(ownershipQuestions(hh.id, sam, db)).toEqual([]);
  });

  it('can turn a car rego guessed as theirs into the household’s', async () => {
    const { hh, sam } = setup();
    const billId = await uploadAs(
      hh.id,
      sam.id,
      regoNoticeFor('Other Roads', 'vehicle_registration'),
    );
    const svc = getBill(hh.id, billId, db)!.service;
    expect(svc.ownerMemberId).toBe(sam.id);
    expect(ownershipQuestions(hh.id, sam, db)).toHaveLength(1);
    answerOwnership(hh.id, svc.id, sam, 'household', db);
    const b = getBill(hh.id, billId, db)!;
    expect([b.ownerMemberId, b.shares.length]).toEqual([null, 2]);
    expect(ownershipQuestions(hh.id, sam, db)).toEqual([]);
  });

  it('is never asked in a household that doesn’t split bills', async () => {
    const { hh, sam } = setup();
    updateHousehold(hh.id, { splitMode: 'single' }, db);
    await uploadAs(hh.id, sam.id, water());
    expect(ownershipQuestions(hh.id, sam, db)).toEqual([]);
  });
});

describe('switching whose a service is, from its bill', () => {
  it('its owner can hand it back; an admin or its payer can make a household one theirs', () => {
    const { jo, sam, power, rego } = setup();
    // Jo's rego: Jo can hand it back, Sam can't touch it.
    expect(canChangeOwner(jo, rego)).toBe(true);
    expect(canChangeOwner(sam, rego)).toBe(false);
    // The household's power (Jo pays, Jo is the admin): Jo can, Sam can't.
    expect(canChangeOwner(jo, power)).toBe(true);
    expect(canChangeOwner(sam, power)).toBe(false);
  });
});
