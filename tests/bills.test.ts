import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { openDb, type Db } from '@/db/client';
import { runMigrations } from '@/db/migrate';
import { createBill, getBill, listBills, setSharePaid, updateBill } from '@/lib/bills';
import { createHousehold, updateHousehold } from '@/lib/households';
import { createMember } from '@/lib/members';
import { createService, listServiceTypes } from '@/lib/services';

let dir: string;
let db: Db;
let hid: string;
let close: () => void;
let bejay: string;
let sam: string;
let internet: string;

beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hud-bills-'));
  runMigrations(dir);
  const opened = openDb(dir);
  db = opened.db;
  close = () => opened.sqlite.close();
  hid = createHousehold(
    {
      name: 'Smith Household',
      currency: 'AUD',
      locale: 'en-AU',
      timezone: 'Australia/Melbourne',
      fiscalYearStartMonth: 7,
      splitMode: 'shared',
    },
    db,
  ).id;
  bejay = createMember(hid,
    { name: 'Bejay', pinHash: 'x', role: 'owner', activeFrom: '2025-01-01' },
    db,
  ).id;
  sam = createMember(hid, { name: 'Sam', pinHash: 'x', activeFrom: '2025-01-01' }, db).id;
  internet = createService(hid,
    {
      typeSlug: 'internet',
      name: 'Internet',
      provider: 'Aussie Broadband',
      accountRef: '14809800',
      payerMemberId: bejay,
    },
    db,
  ).id;
});

afterAll(() => {
  close();
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('service type catalog', () => {
  it('is seeded by the migration', () => {
    expect(listServiceTypes(db).map((t) => t.slug)).toEqual([
      'internet',
      'electricity',
      'gas',
      'water',
      'rent',
      'other',
    ]);
  });
});

describe('createBill', () => {
  it('creates shares, marks the payer paid, and renders a payment reference', () => {
    const b = createBill(hid,
      {
        serviceId: internet,
        amountMinor: 12900,
        taxMinor: 1173,
        taxLabel: 'GST',
        periodStart: '2026-06-14',
        periodEnd: '2026-07-13',
        issueDate: '2026-06-14',
        dueDate: '2026-06-26',
        source: 'manual',
        externalRef: '59259831',
        paidToProviderAt: '2026-06-26T00:00:00Z',
      },
      db,
    );
    expect(b.currency).toBe('AUD');
    expect(b.shares).toHaveLength(2);
    const mine = b.shares.find((s) => s.memberId === bejay)!;
    const theirs = b.shares.find((s) => s.memberId === sam)!;
    expect(mine.amountMinor + theirs.amountMinor).toBe(12900);
    expect(mine.paidMethod).toBe('payer');
    expect(theirs.paidAt).toBeNull();
    expect(theirs.paymentReference).toBe('Internet Jun26 Sam');
  });

  it('rejects a duplicate invoice number for the same service', () => {
    expect(() =>
      createBill(hid,
        {
          serviceId: internet,
          amountMinor: 1,
          periodStart: '2026-07-14',
          periodEnd: '2026-08-13',
          dueDate: '2026-07-28',
          source: 'manual',
          externalRef: '59259831',
        },
        db,
      ),
    ).toThrow(/already exists/);
  });

  it('lists bills with share counts', () => {
    const list = listBills(hid, {}, db);
    expect(list).toHaveLength(1);
    expect(list[0]?.shareCount).toBe(2);
    expect(list[0]?.paidShareCount).toBe(1);
    expect(list[0]?.service.provider).toBe('Aussie Broadband');
  });

  it('marks a share paid and then locks the amount', () => {
    const b = listBills(hid, {}, db)[0]!;
    const theirs = getBill(hid, b.id, db)!.shares.find((s) => s.memberId === sam)!;
    const updated = setSharePaid(hid, theirs.id, true, { markedByMemberId: sam }, db);
    expect(updated.paidAt).not.toBeNull();
    expect(() => updateBill(hid, b.id, { amountMinor: 1 }, db)).toThrow(/locked/);
    // Non-share fields still editable.
    expect(updateBill(hid, b.id, { notes: 'hi' }, db).notes).toBe('hi');
  });

  it('recomputes shares when the amount changes and nothing is paid', () => {
    const b = createBill(hid,
      {
        serviceId: internet,
        amountMinor: 1000,
        periodStart: '2026-07-14',
        periodEnd: '2026-08-13',
        dueDate: '2026-07-28',
        source: 'manual',
      },
      db,
    );
    const u = updateBill(hid, b.id, { amountMinor: 2000 }, db);
    expect(u.shares.reduce((t, s) => t + s.amountMinor, 0)).toBe(2000);
  });

  it('creates no shares in single mode', () => {
    updateHousehold(hid, { splitMode: 'single' }, db);
    const b = createBill(hid,
      {
        serviceId: internet,
        amountMinor: 500,
        periodStart: '2026-08-14',
        periodEnd: '2026-09-13',
        dueDate: '2026-08-28',
        source: 'manual',
      },
      db,
    );
    expect(b.shares).toEqual([]);
    updateHousehold(hid, { splitMode: 'shared' }, db);
  });
});
