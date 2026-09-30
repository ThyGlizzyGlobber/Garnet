import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { openDb, type Db } from '@/db/client';
import { runMigrations } from '@/db/migrate';
import type { Household, Member } from '@/db/schema';
import type { ExtractedBill } from '@/ingest/extractors/types';
import { serviceForNewProvider } from '@/lib/auto-service';
import { filterBills } from '@/lib/bill-search';
import {
  createBill,
  getBill,
  listBills,
  moveBill,
  setSharePaid,
  type BillInput,
} from '@/lib/bills';
import { createHousehold, getHousehold } from '@/lib/households';
import { createMember } from '@/lib/members';
import { mayMoveBill } from '@/lib/ownership';
import {
  cancelService,
  chargedAfterCancel,
  createService,
  getService,
  groupServices,
  listServices,
  listServiceTypes,
  resumeService,
  updateService,
} from '@/lib/services';
import { servicesView } from '@/lib/services-view';
import { shellView } from '@/lib/shell';

const TODAY = '2026-09-29';
let dir: string;
let db: Db;
let close: () => void;
let hh: Household;
let alex: Member;
let sam: Member;

beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hud-subsvc-'));
  runMigrations(dir);
  const opened = openDb(dir);
  db = opened.db;
  close = () => opened.sqlite.close();
  const id = createHousehold(
    {
      name: 'Riverside House',
      currency: 'AUD',
      locale: 'en-AU',
      timezone: 'Australia/Melbourne',
      fiscalYearStartMonth: 7,
      splitMode: 'shared',
    },
    db,
  ).id;
  hh = getHousehold(id, db)!;
  alex = createMember(
    id,
    { name: 'Alex', pinHash: 'x', role: 'owner', activeFrom: '2025-01-01' },
    db,
  );
  sam = createMember(id, { name: 'Sam', pinHash: 'x', activeFrom: '2025-01-01' }, db);
});

afterAll(() => {
  close();
  fs.rmSync(dir, { recursive: true, force: true });
});

const extracted = (x: Partial<ExtractedBill>): ExtractedBill => ({
  provider: 'Streamly',
  serviceType: 'subscriptions',
  amountMinor: 2299,
  currency: 'AUD',
  periodStart: '2026-09-05',
  periodEnd: '2026-10-04',
  dueDate: '2026-09-05',
  ...x,
});

const bill = (serviceId: string, x: Partial<BillInput> = {}) =>
  createBill(
    hh.id,
    {
      serviceId,
      amountMinor: 2000,
      periodStart: '2026-08-05',
      periodEnd: '2026-09-04',
      issueDate: '2026-08-05',
      dueDate: '2026-08-05',
      source: 'manual',
      ...x,
    },
    db,
  );

describe('the catalog', () => {
  it('has Donations under Lifestyle, and Subscriptions and Donations hold sub-services', () => {
    const types = listServiceTypes(db);
    const donations = types.find((t) => t.slug === 'donations')!;
    expect(donations).toMatchObject({ category: 'lifestyle', hasSubServices: true });
    expect(types.filter((t) => t.hasSubServices).map((t) => t.slug)).toEqual([
      'subscriptions',
      'donations',
    ]);
  });

  it('gives every type one colour, the same for every household', () => {
    const types = listServiceTypes(db);
    expect(types.find((t) => t.slug === 'electricity')!.colour).toBe('#eda100');
    expect(types.find((t) => t.slug === 'water')!.colour).toBe('#1baf7a');
    // The everyday bills never share a colour.
    const common = ['internet', 'electricity', 'gas', 'water', 'phone', 'rent', 'council_rates'];
    const colours = common.map((slug) => types.find((t) => t.slug === slug)!.colour);
    expect(new Set(colours).size).toBe(common.length);
  });
});

describe('service colours', () => {
  it('follow the type, on create and when the type changes', () => {
    const svc = createService(
      hh.id,
      { typeSlug: 'gas', name: 'Gas', provider: 'Hearthline Gas', payerMemberId: alex.id },
      db,
    );
    expect(svc.colour).toBe('#eb6834');
    expect(updateService(hh.id, svc.id, { typeSlug: 'water' }, db).colour).toBe('#1baf7a');
  });
});

describe('sub-services', () => {
  it('are set up from a bill, one per provider, named after the provider', () => {
    const first = serviceForNewProvider(hh.id, extracted({}), { member: alex.id }, db)!;
    expect(first.created).toBe(true);
    expect(first.service.name).toBe('Streamly');
    const second = serviceForNewProvider(
      hh.id,
      extracted({ provider: 'Flickbox Pty Ltd' }),
      { member: alex.id },
      db,
    )!;
    expect(second.created).toBe(true);
    expect(second.service.name).toBe('Flickbox');
    // The same provider again is the same sub-service.
    const again = serviceForNewProvider(hh.id, extracted({}), {}, db)!;
    expect(again).toMatchObject({ created: false, service: { id: first.service.id } });
  });

  it('are gathered under their main service in lists and the nav', () => {
    const groups = groupServices(listServices(hh.id, {}, db));
    const subs = groups.find((g) => g.typeSlug === 'subscriptions')!;
    expect(subs.label).toBe('Subscriptions');
    expect(subs.services.map((s) => s.name).sort()).toEqual(['Flickbox', 'Streamly']);
    // Every other service stands on its own.
    expect(groups.filter((g) => !g.typeSlug).every((g) => g.services.length === 1)).toBe(true);

    const streamly = listServices(hh.id, {}, db).find((s) => s.name === 'Streamly')!;
    bill(streamly.id, { periodStart: '2026-09-05', periodEnd: '2026-10-04', amountMinor: 3100 });
    const shell = shellView(hh, alex, TODAY, db);
    const entry = shell.services.find((e) => e.kind === 'group')!;
    expect(entry).toMatchObject({
      kind: 'group',
      href: '/services/group/subscriptions',
      category: null,
      name: 'Subscriptions',
    });
    if (entry.kind !== 'group') throw new Error('not a group');
    expect(entry.children.map((c) => c.name).sort()).toEqual(['Flickbox', 'Streamly']);
    expect(entry.minor).toBe(entry.children.reduce((s, c) => s + c.minor, 0));
    expect(entry.minor).toBeGreaterThan(0);
  });
});

describe('cancelling a sub-service', () => {
  it('keeps its bills, says who and when, and flags a bill charged after', () => {
    const flickbox = listServices(hh.id, {}, db).find((s) => s.name === 'Flickbox')!;
    const before = bill(flickbox.id, { issueDate: '2026-08-05' });
    const cancelled = cancelService(hh.id, flickbox.id, sam.id, db);
    expect(cancelled).toMatchObject({ isActive: false, cancelledByMemberId: sam.id });
    expect(cancelled.cancelledAt).toBeTruthy();
    expect(listBills(hh.id, { serviceId: flickbox.id }, db).map((b) => b.id)).toEqual([before.id]);
    expect(chargedAfterCancel(cancelled, before)).toBe(false);

    // Out of the nav and the Services page, still on its main service's page.
    expect(listServices(hh.id, {}, db).some((s) => s.id === flickbox.id)).toBe(false);
    const group = servicesView(hh, alex.id, TODAY, 'all', db, 'subscriptions');
    expect(group.services.at(-1)).toMatchObject({ id: flickbox.id, cancelled: { by: sam.id } });

    // A new bill from Flickbox still lands on it, stays cancelled, and is flagged.
    const again = serviceForNewProvider(hh.id, extracted({ provider: 'Flickbox' }), {}, db)!;
    expect(again.service.id).toBe(flickbox.id);
    expect(getService(hh.id, flickbox.id, db)!.cancelledAt).toBeTruthy();
    const later = bill(flickbox.id, {
      issueDate: '2099-01-05',
      periodStart: '2099-01-05',
      periodEnd: '2099-02-04',
      dueDate: '2099-01-05',
    });
    expect(chargedAfterCancel(getService(hh.id, flickbox.id, db)!, later)).toBe(true);
    expect(
      servicesView(hh, alex.id, TODAY, 'all', db, 'subscriptions').services.find(
        (s) => s.id === flickbox.id,
      )!.afterCancel,
    ).toBe(1);

    const resumed = resumeService(hh.id, flickbox.id, db);
    expect(resumed).toMatchObject({ isActive: true, cancelledAt: null, cancelledByMemberId: null });
  });
});

describe('moving a bill', () => {
  it('re-splits it by the new service, and keeps paid shares when a housemate has paid', () => {
    const rent = createService(
      hh.id,
      {
        typeSlug: 'rent',
        name: 'Rent',
        provider: 'Harbour Lane',
        payerMemberId: alex.id,
        splitMode: 'percent',
        customSplits: { [alex.id]: 60, [sam.id]: 40 },
      },
      db,
    );
    const water = createService(
      hh.id,
      { typeSlug: 'water', name: 'Water', provider: 'Riverbend', payerMemberId: alex.id },
      db,
    );
    const b = bill(water.id, { amountMinor: 10000 });
    expect(b.shares.find((s) => s.memberId === sam.id)!.amountMinor).toBe(5000);
    const moved = moveBill(hh.id, b.id, rent.id, db);
    expect(moved.serviceId).toBe(rent.id);
    expect(moved.shares.find((s) => s.memberId === sam.id)!.amountMinor).toBe(4000);

    const samShare = moved.shares.find((s) => s.memberId === sam.id)!;
    setSharePaid(hh.id, samShare.id, true, { method: 'transfer' }, db);
    const back = moveBill(hh.id, b.id, water.id, db);
    expect(back.serviceId).toBe(water.id);
    expect(back.shares.find((s) => s.memberId === sam.id)).toMatchObject({
      id: samShare.id,
      amountMinor: 4000,
    });
  });

  it('only onto a service the mover may take it to', () => {
    const household = createService(
      hh.id,
      { typeSlug: 'internet', name: 'Internet', provider: 'Brightline', payerMemberId: alex.id },
      db,
    );
    const alexOwn = createService(
      hh.id,
      { typeSlug: 'donations', name: 'Food Bank', provider: 'Food Bank', ownerMemberId: alex.id },
      db,
    );
    const b = bill(household.id, { createdByMemberId: sam.id });
    const svcAlex = getService(hh.id, alexOwn.id, db)!;
    // Sam can't see Alex's own service; Alex didn't bring this bill in.
    expect(mayMoveBill(hh.id, sam, b, svcAlex, db)).toBe(false);
    expect(mayMoveBill(hh.id, alex, b, svcAlex, db)).toBe(false);
    const alexsBill = bill(household.id, { createdByMemberId: alex.id });
    expect(mayMoveBill(hh.id, alex, alexsBill, svcAlex, db)).toBe(true);
    const mine = moveBill(hh.id, alexsBill.id, alexOwn.id, db);
    expect(mine).toMatchObject({ ownerMemberId: alex.id, shares: [] });
    // And back to the household, split again.
    expect(mayMoveBill(hh.id, alex, mine, household, db)).toBe(true);
    const shared = moveBill(hh.id, mine.id, household.id, db);
    expect(shared.ownerMemberId).toBeNull();
    expect(shared.shares).toHaveLength(2);

    // Once a housemate has paid a share it stays with the household.
    const paid = bill(household.id, { createdByMemberId: alex.id });
    setSharePaid(
      hh.id,
      paid.shares.find((s) => s.memberId === sam.id)!.id,
      true,
      { method: 'transfer' },
      db,
    );
    expect(() => moveBill(hh.id, paid.id, alexOwn.id, db)).toThrow(/stays with the household/);
    expect(getBill(hh.id, paid.id, db)!.serviceId).toBe(household.id);
  });
});

describe('the bills list', () => {
  it('shows months up to this one by default, and the later ones on request', () => {
    const svc = createService(
      hh.id,
      { typeSlug: 'phone', name: 'Phone', provider: 'Tellmo', payerMemberId: alex.id },
      db,
    );
    const now = bill(svc.id, {
      issueDate: '2026-09-10',
      periodStart: '2026-09-10',
      periodEnd: '2026-10-09',
    });
    const ahead = bill(svc.id, {
      issueDate: '2026-11-10',
      periodStart: '2026-11-10',
      periodEnd: '2026-12-09',
      dueDate: '2026-11-24',
    });
    const all = listBills(hh.id, { serviceId: svc.id }, db);
    const ctx = { locale: 'en-AU', today: TODAY };
    const byDefault = filterBills(all, {}, ctx);
    expect(byDefault.entries.map((e) => e.bill.id)).toEqual([now.id]);
    expect(byDefault.later).toBe(1);
    expect(filterBills(all, { when: 'upcoming' }, ctx).entries.map((e) => e.bill.id)).toEqual([
      ahead.id,
    ]);
    expect(filterBills(all, { when: 'all' }, ctx).entries).toHaveLength(2);
  });

  it('filters a main service to all its sub-services', () => {
    const all = listBills(hh.id, {}, db);
    const subs = filterBills(
      all,
      { typeSlug: 'subscriptions', when: 'all' },
      {
        locale: 'en-AU',
        today: TODAY,
      },
    ).entries;
    expect(subs.length).toBeGreaterThan(0);
    expect(subs.every((e) => e.bill.service.typeSlug === 'subscriptions')).toBe(true);
  });
});
