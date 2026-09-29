import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { openDb, type Db } from '@/db/client';
import { runMigrations } from '@/db/migrate';
import { archiveDocument, getDocument } from '@/ingest/archive';
import { processDocument } from '@/ingest/pipeline';
import {
  createBill,
  deleteBill,
  getBill,
  listBills,
  setBillPaidToProvider,
  setSharePaid,
  updateBill,
} from '@/lib/bills';
import {
  createHousehold,
  deleteHousehold,
  getHousehold,
  listHouseholds,
  primaryHousehold,
  updateHousehold,
} from '@/lib/households';
import { createMember, deleteMember, getMember, listMembers, updateMember } from '@/lib/members';
import { projectMonth } from '@/lib/projections';
import { remindersFor } from '@/lib/reminders';
import { documentCounts, getReviewItem, listDocuments } from '@/lib/review';
import {
  createService,
  getCustomSplits,
  getService,
  listServices,
  setCustomSplits,
  updateService,
} from '@/lib/services';
import { dashboardSummary, householdBalances, memberLedger, settlementRate } from '@/lib/stats';

/**
 * Two households side by side. Every read must see only its own household,
 * and every write by id must refuse (or quietly miss) the other household's rows.
 */
let dir: string;
let db: Db;
let close: () => void;

const setup = (name: string) => {
  const hh = createHousehold(
    {
      name,
      currency: 'AUD',
      locale: 'en-AU',
      timezone: 'Australia/Melbourne',
      fiscalYearStartMonth: 7,
      splitMode: 'shared',
    },
    db,
  );
  // Same member name in both households on purpose: names are unique per household only.
  const owner = createMember(
    hh.id,
    { name: 'Alex', pinHash: 'x', role: 'owner', activeFrom: '2026-01-01' },
    db,
  );
  const other = createMember(hh.id, { name: 'Sam', pinHash: 'x', activeFrom: '2026-01-01' }, db);
  const svc = createService(
    hh.id,
    {
      typeSlug: 'internet',
      name: 'Internet',
      provider: 'Aussie Broadband',
      payerMemberId: owner.id,
    },
    db,
  );
  const bill = createBill(
    hh.id,
    {
      serviceId: svc.id,
      amountMinor: 10000,
      periodStart: '2026-09-01',
      periodEnd: '2026-09-30',
      dueDate: '2026-09-15',
      source: 'manual',
      externalRef: 'INV-1',
    },
    db,
  );
  const otherShare = bill.shares.find((s) => s.memberId === other.id)!;
  return { hh, owner, other, svc, bill, otherShare };
};

let A: ReturnType<typeof setup>;
let B: ReturnType<typeof setup>;

beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hud-households-'));
  runMigrations(dir);
  const opened = openDb(dir);
  db = opened.db;
  close = () => opened.sqlite.close();
  A = setup('Smith Household');
  B = setup('Aunt Household');
});

afterAll(() => {
  close();
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('households', () => {
  it('coexist, and the first one is the primary', () => {
    expect(listHouseholds(db).map((h) => h.name)).toEqual(['Smith Household', 'Aunt Household']);
    expect(primaryHousehold(db)?.id).toBe(A.hh.id);
  });

  it('allow the same member name in different households', () => {
    expect(listMembers(A.hh.id, db).map((m) => m.name)).toEqual(['Alex', 'Sam']);
    expect(listMembers(B.hh.id, db).map((m) => m.name)).toEqual(['Alex', 'Sam']);
    expect(() =>
      createMember(A.hh.id, { name: 'alex', pinHash: 'x', activeFrom: '2026-01-01' }, db),
    ).toThrow(/already exists/);
  });

  it('update settings independently', () => {
    updateHousehold(B.hh.id, { currency: 'NZD' }, db);
    expect(getHousehold(A.hh.id, db)?.currency).toBe('AUD');
    expect(getHousehold(B.hh.id, db)?.currency).toBe('NZD');
    updateHousehold(B.hh.id, { currency: 'AUD' }, db);
  });
});

describe('reads are scoped', () => {
  it('lists only the household’s own rows', () => {
    expect(listServices(A.hh.id, {}, db).map((s) => s.id)).toEqual([A.svc.id]);
    expect(listBills(A.hh.id, {}, db).map((b) => b.id)).toEqual([A.bill.id]);
    expect(
      householdBalances(A.hh.id, db)
        .map((b) => b.member.id)
        .sort(),
    ).toEqual([A.owner.id, A.other.id].sort());
  });

  it('never returns another household’s row by id', () => {
    expect(getMember(A.hh.id, B.owner.id, db)).toBeNull();
    expect(getService(A.hh.id, B.svc.id, db)).toBeNull();
    expect(getBill(A.hh.id, B.bill.id, db)).toBeNull();
    expect(memberLedger(A.hh.id, B.other.id, '2026-09-20', 7, db)).toBeNull();
    expect(remindersFor(A.hh.id, B.other.id, '2026-09-20', 7, db)).toEqual([]);
  });

  it('totals and projections count only the household’s bills', () => {
    const s = dashboardSummary(A.hh.id, '2026-09-20', 7, db);
    expect(s.thisMonth.total).toBe(10000);
    expect(s.activeMemberCount).toBe(2);
    expect(settlementRate(A.hh.id, '2026-09', db).total).toBe(1);
    const p = projectMonth(A.hh.id, '2026-10', db);
    expect(p.services.map((x) => x.service.id)).toEqual([A.svc.id]);
  });
});

describe('writes by id cannot reach another household', () => {
  it('bills', () => {
    expect(() => updateBill(A.hh.id, B.bill.id, { notes: 'x' }, db)).toThrow(/not found/);
    deleteBill(A.hh.id, B.bill.id, db);
    expect(getBill(B.hh.id, B.bill.id, db)).not.toBeNull();
    setBillPaidToProvider(A.hh.id, B.bill.id, true, db);
    expect(getBill(B.hh.id, B.bill.id, db)?.paidToProviderAt).toBeNull();
  });

  it('shares', () => {
    expect(() => setSharePaid(A.hh.id, B.otherShare.id, true, {}, db)).toThrow(/not found/);
    const share = getBill(B.hh.id, B.bill.id, db)!.shares.find((s) => s.id === B.otherShare.id);
    expect(share?.paidAt).toBeNull();
  });

  it('bills cannot be filed under another household’s service', () => {
    expect(() =>
      createBill(
        A.hh.id,
        {
          serviceId: B.svc.id,
          amountMinor: 1,
          periodStart: '2026-09-01',
          periodEnd: '2026-09-30',
          dueDate: '2026-09-15',
          source: 'manual',
        },
        db,
      ),
    ).toThrow(/Service not found/);
    expect(() => updateBill(A.hh.id, A.bill.id, { serviceId: B.svc.id }, db)).toThrow(
      /Service not found/,
    );
  });

  it('services cannot name another household’s member as payer or split member', () => {
    expect(() =>
      createService(
        A.hh.id,
        { typeSlug: 'gas', name: 'Gas', provider: 'X', payerMemberId: B.owner.id },
        db,
      ),
    ).toThrow(/not a member/);
    expect(() => updateService(A.hh.id, A.svc.id, { payerMemberId: B.owner.id }, db)).toThrow(
      /not a member/,
    );
    expect(() => updateService(A.hh.id, B.svc.id, { name: 'x' }, db)).toThrow(/not found/);
    setCustomSplits(A.hh.id, A.svc.id, { [A.owner.id]: 2, [B.owner.id]: 5 }, db);
    expect(getCustomSplits(A.hh.id, A.svc.id, db)).toEqual({ [A.owner.id]: 2 });
    expect(() => setCustomSplits(A.hh.id, B.svc.id, { [A.owner.id]: 1 }, db)).toThrow(/not found/);
  });

  it('members', () => {
    expect(() => updateMember(A.hh.id, B.other.id, { name: 'Hacked' }, db)).toThrow(/not found/);
    deleteMember(A.hh.id, B.other.id, db);
    expect(getMember(B.hh.id, B.other.id, db)?.name).toBe('Sam');
  });
});

describe('documents', () => {
  it('are archived per household, even for identical bytes', () => {
    const buffer = Buffer.from('Same bill forwarded to both households');
    const a = archiveDocument(A.hh.id, { kind: 'upload', buffer, originalFilename: 'a.txt' }, db);
    const b = archiveDocument(B.hh.id, { kind: 'upload', buffer, originalFilename: 'b.txt' }, db);
    expect(a.duplicate).toBe(false);
    expect(b.duplicate).toBe(false);
    expect(a.doc.id).not.toBe(b.doc.id);
    expect(archiveDocument(A.hh.id, { kind: 'upload', buffer }, db).duplicate).toBe(true);

    expect(listDocuments(A.hh.id, {}, db).map((d) => d.id)).toEqual([a.doc.id]);
    expect(getDocument(A.hh.id, b.doc.id, db)).toBeNull();
    expect(getReviewItem(A.hh.id, b.doc.id, db)).toBeNull();
    expect(documentCounts(A.hh.id, {}, db).unprocessed).toBe(1);
  });

  it('cannot be processed from another household', async () => {
    const other = listDocuments(B.hh.id, {}, db)[0]!;
    await expect(processDocument(A.hh.id, other.id, db)).rejects.toThrow(/not found/);
  });
});

describe('deleting a household', () => {
  it('removes its rows and leaves the other household untouched', () => {
    const before = listBills(A.hh.id, {}, db).length;
    deleteHousehold(B.hh.id, db);
    expect(getHousehold(B.hh.id, db)).toBeNull();
    expect(listMembers(B.hh.id, db)).toEqual([]);
    expect(listBills(B.hh.id, {}, db)).toEqual([]);
    expect(listDocuments(B.hh.id, {}, db)).toEqual([]);
    expect(listBills(A.hh.id, {}, db)).toHaveLength(before);
    expect(getBill(A.hh.id, A.bill.id, db)?.shares).toHaveLength(2);
  });
});
