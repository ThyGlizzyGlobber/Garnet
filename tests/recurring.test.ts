import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { openDb, type Db } from '@/db/client';
import { runMigrations } from '@/db/migrate';
import { service } from '@/db/schema';
import { createBill, getBill, listBills, setSharePaid } from '@/lib/bills';
import { createHousehold } from '@/lib/households';
import { createMember } from '@/lib/members';
import {
  isRecurring,
  priceChange,
  recordRecurringCharges,
  setRecurring,
  upcomingCharge,
} from '@/lib/recurring';
import { createService, getService, updateService } from '@/lib/services';

let dir: string;
let db: Db;
let close: () => void;
let hid: string;
let alex: string;
let sam: string;

beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hud-recurring-'));
  runMigrations(dir);
  const opened = openDb(dir);
  db = opened.db;
  close = () => opened.sqlite.close();
  hid = createHousehold(
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
  alex = createMember(
    hid,
    { name: 'Alex', pinHash: 'x', role: 'owner', activeFrom: '2025-01-01' },
    db,
  ).id;
  sam = createMember(hid, { name: 'Sam', pinHash: 'x', activeFrom: '2025-01-01' }, db).id;
});

afterAll(() => {
  close();
  fs.rmSync(dir, { recursive: true, force: true });
});

/** A monthly subscription recurring since 1 Sep 2026, with its September bill. */
function subscription(name: string, amountMinor = 2299) {
  const svc = createService(
    hid,
    { typeSlug: 'subscriptions', name, provider: name, cadence: 'monthly', payerMemberId: alex },
    db,
  );
  db.update(service)
    .set({ recurringSince: '2026-09-01T00:00:00.000Z' })
    .where(eq(service.id, svc.id))
    .run();
  const september = createBill(
    hid,
    {
      serviceId: svc.id,
      amountMinor,
      periodStart: '2026-09-05',
      periodEnd: '2026-10-04',
      issueDate: '2026-09-05',
      dueDate: '2026-09-05',
      source: 'manual',
    },
    db,
  );
  return { svc: getService(hid, svc.id, db)!, september };
}

const at = (day: string) => new Date(`${day}T12:00:00+10:00`);

describe('recurring services', () => {
  it('are on for new subscriptions, off for other services and irregular bills', () => {
    expect(
      isRecurring(
        createService(
          hid,
          { typeSlug: 'subscriptions', name: 'Tunewave', provider: 'Tunewave' },
          db,
        ),
      ),
    ).toBe(true);
    const gym = createService(hid, { typeSlug: 'gym', name: 'Gym', provider: 'Lift' }, db);
    expect(isRecurring(gym)).toBe(false);
    expect(isRecurring(updateService(hid, gym.id, { recurring: true }, db))).toBe(true);
    expect(isRecurring(updateService(hid, gym.id, { cadence: 'irregular' }, db))).toBe(false);
  });

  it('expect the next charge at the latest price', () => {
    const { svc } = subscription('Streamly');
    expect(upcomingCharge(svc, listBills(hid, { serviceId: svc.id }, db))).toEqual({
      serviceId: svc.id,
      periodStart: '2026-10-05',
      periodEnd: '2026-11-04',
      dueDate: '2026-10-05',
      amountMinor: 2299,
    });
    setRecurring(hid, svc.id, false, db);
    expect(
      upcomingCharge(getService(hid, svc.id, db)!, listBills(hid, { serviceId: svc.id }, db)),
    ).toBeNull();
  });

  it('record an assumed bill once its date passes, and never back-fill', () => {
    const { svc } = subscription('Flickbox', 1699);
    recordRecurringCharges(at('2026-10-04'), db);
    expect(listBills(hid, { serviceId: svc.id }, db)).toHaveLength(1);
    recordRecurringCharges(at('2026-10-05'), db);
    const [october] = listBills(hid, { serviceId: svc.id }, db);
    expect(october).toMatchObject({
      assumed: true,
      source: 'recurring',
      amountMinor: 1699,
      periodStart: '2026-10-05',
      dueDate: '2026-10-05',
    });
    // Split like any other bill.
    expect(
      getBill(hid, october!.id, db)!
        .shares.map((s) => s.amountMinor)
        .sort(),
    ).toEqual([849, 850]);
    // Running again records nothing more.
    recordRecurringCharges(at('2026-10-05'), db);
    expect(listBills(hid, { serviceId: svc.id }, db)).toHaveLength(2);
  });

  it('skip charges due before it was made recurring', () => {
    const svc = createService(
      hid,
      { typeSlug: 'gym', name: 'Old gym', provider: 'Pump', cadence: 'monthly' },
      db,
    );
    createBill(
      hid,
      {
        serviceId: svc.id,
        amountMinor: 5000,
        periodStart: '2026-01-10',
        periodEnd: '2026-02-09',
        dueDate: '2026-01-10',
        source: 'manual',
      },
      db,
    );
    db.update(service)
      .set({ recurringSince: '2026-09-20T00:00:00.000Z' })
      .where(eq(service.id, svc.id))
      .run();
    recordRecurringCharges(at('2026-10-15'), db);
    const bills = listBills(hid, { serviceId: svc.id }, db);
    // February to September were before it was recurring; only 10 October is assumed.
    expect(bills.filter((b) => b.assumed).map((b) => b.dueDate)).toEqual(['2026-10-10']);
  });

  it('let the real bill take the assumed one’s place, with its new price', () => {
    const { svc } = subscription('Viewly', 2299);
    recordRecurringCharges(at('2026-10-06'), db);
    const assumed = listBills(hid, { serviceId: svc.id }, db).find((b) => b.assumed)!;
    // Sam paid their share of the assumed charge before the bill came.
    const samShare = getBill(hid, assumed.id, db)!.shares.find((s) => s.memberId === sam)!;
    setSharePaid(hid, samShare.id, true, { method: 'transfer' }, db);

    const real = createBill(
      hid,
      {
        serviceId: svc.id,
        amountMinor: 2499,
        periodStart: '2026-10-05',
        periodEnd: '2026-11-04',
        issueDate: '2026-10-05',
        dueDate: '2026-10-05',
        externalRef: 'VW-1005',
        source: 'llm',
      },
      db,
    );
    expect(real.id).toBe(assumed.id);
    expect(real).toMatchObject({ assumed: false, amountMinor: 2499, externalRef: 'VW-1005' });
    expect(listBills(hid, { serviceId: svc.id }, db)).toHaveLength(2);
    // Split again at the new price; Sam stays paid.
    const shares = real.shares;
    expect(shares.map((s) => s.amountMinor).sort()).toEqual([1249, 1250]);
    expect(shares.find((s) => s.memberId === sam)!.paidAt).toBeTruthy();

    // The price change is seen, and the next charge uses the new price.
    const bills = listBills(hid, { serviceId: svc.id }, db);
    expect(priceChange(svc, bills)).toEqual({
      billId: real.id,
      fromMinor: 2299,
      toMinor: 2499,
    });
    expect(upcomingCharge(svc, bills)?.amountMinor).toBe(2499);
  });

  it('leave a bill for another period alone', () => {
    const { svc } = subscription('Readly');
    recordRecurringCharges(at('2026-10-06'), db);
    const december = createBill(
      hid,
      {
        serviceId: svc.id,
        amountMinor: 2299,
        periodStart: '2026-12-05',
        periodEnd: '2027-01-04',
        dueDate: '2026-12-05',
        source: 'manual',
      },
      db,
    );
    expect(december.assumed).toBe(false);
    expect(listBills(hid, { serviceId: svc.id }, db).filter((b) => b.assumed)).toHaveLength(1);
  });

  it('keep a one-day charge on its day, and start after it was made recurring', () => {
    const svc = createService(
      hid,
      {
        typeSlug: 'donations',
        name: 'Food Bank',
        provider: 'Food Bank',
        cadence: 'monthly',
        ownerMemberId: alex,
      },
      db,
    );
    createBill(
      hid,
      {
        serviceId: svc.id,
        amountMinor: 2500,
        periodStart: '2026-08-05',
        periodEnd: '2026-08-05',
        dueDate: '2026-08-05',
        source: 'manual',
      },
      db,
    );
    db.update(service)
      .set({ recurringSince: '2026-09-20T00:00:00.000Z' })
      .where(eq(service.id, svc.id))
      .run();
    // 5 September came before it was recurring: the next is 5 October, one day.
    expect(
      upcomingCharge(getService(hid, svc.id, db)!, listBills(hid, { serviceId: svc.id }, db)),
    ).toMatchObject({ periodStart: '2026-10-05', periodEnd: '2026-10-05', dueDate: '2026-10-05' });
  });
});
