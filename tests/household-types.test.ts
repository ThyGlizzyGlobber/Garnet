import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { openDb, type Db } from '@/db/client';
import { runMigrations } from '@/db/migrate';
import { share } from '@/db/schema';
import { createBill } from '@/lib/bills';
import { createHousehold, updateHousehold } from '@/lib/households';
import {
  defaultRole,
  roleFor,
  roleKey,
  rolesForType,
  splitModeFor,
  typeIcon,
} from '@/lib/household-types';
import { createMember, setMemberRole } from '@/lib/members';
import { createService, getService, updateService } from '@/lib/services';
import { membersInSplit } from '@/lib/splits';
import { splitView } from '@/lib/split-view';

let dir: string;
let db: Db;
let close: () => void;

beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hud-types-'));
  runMigrations(dir);
  const opened = openDb(dir);
  db = opened.db;
  close = () => opened.sqlite.close();
});

afterAll(() => {
  close();
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('household types and roles (SCOPE-accounts.md §7)', () => {
  it('filter the roles by type, and name admins by the kind of place', () => {
    expect(rolesForType('own_home')).toEqual(['owner', 'family']);
    expect(rolesForType('investment_property')).toEqual(['owner', 'tenant', 'boarder']);
    expect(rolesForType('share_house')).toEqual(['owner', 'tenant', 'boarder']);
    expect(rolesForType(null)).toEqual(['owner', 'member']);
    expect(defaultRole('own_home')).toBe('family');
    expect(defaultRole('share_house')).toBe('tenant');
    expect(defaultRole(null)).toBe('member');
    expect(roleFor('own_home', 'tenant')).toBe('family');
    expect(roleFor('share_house', 'boarder')).toBe('boarder');
    expect(roleFor('own_home', 'owner')).toBe('owner');
    expect(roleKey('owner', 'investment_property')).toBe('landlord');
    expect(roleKey('owner', 'share_house')).toBe('owner');
    expect(roleKey('tenant', null)).toBe('tenant');
    expect(splitModeFor('own_home')).toBe('single');
    expect(splitModeFor('share_house')).toBe('shared');
    expect([
      typeIcon('own_home'),
      typeIcon('investment_property'),
      typeIcon('share_house'),
    ]).toEqual(['home', 'building', 'users']);
  });

  it('are stored on the household and can be set later', () => {
    const hh = createHousehold(
      {
        name: 'Typed House',
        currency: 'AUD',
        locale: 'en-AU',
        timezone: 'Australia/Melbourne',
        fiscalYearStartMonth: 7,
        splitMode: 'shared',
      },
      db,
    );
    expect(hh.type).toBeNull();
    updateHousehold(hh.id, { type: 'share_house' }, db);
    expect(updateHousehold(hh.id, {}, db).type).toBe('share_house');
  });
});

describe('boarders (D14)', () => {
  it('pay no share until an admin puts them in a service’s split', () => {
    const hh = createHousehold(
      {
        name: 'Boarder House',
        currency: 'AUD',
        locale: 'en-AU',
        timezone: 'Australia/Melbourne',
        fiscalYearStartMonth: 7,
        splitMode: 'shared',
        type: 'share_house',
      },
      db,
    );
    const admin = createMember(
      hh.id,
      { name: 'Admin', role: 'owner', activeFrom: '2026-01-01' },
      db,
    );
    const tenant = createMember(
      hh.id,
      { name: 'Tenant', role: 'tenant', activeFrom: '2026-01-01' },
      db,
    );
    // A service made before the boarder arrives, and one after.
    const rent = createService(
      hh.id,
      { typeSlug: 'rent', name: 'Rent', provider: 'Agent', payerMemberId: admin.id },
      db,
    );
    const boarder = createMember(
      hh.id,
      { name: 'Boarder', role: 'boarder', activeFrom: '2026-01-01' },
      db,
    );
    const power = createService(
      hh.id,
      { typeSlug: 'electricity', name: 'Power', provider: 'Grid', payerMemberId: admin.id },
      db,
    );
    expect(getService(hh.id, rent.id, db)!.notSplitWith).toEqual([boarder.id]);
    expect(getService(hh.id, power.id, db)!.notSplitWith).toEqual([boarder.id]);
    const all = [admin, tenant, boarder];
    expect(membersInSplit(all, power).map((m) => m.name)).toEqual(['Admin', 'Tenant']);

    const bill = createBill(
      hh.id,
      {
        serviceId: power.id,
        amountMinor: 30000,
        periodStart: '2026-07-01',
        periodEnd: '2026-09-30',
        dueDate: '2026-10-20',
        source: 'manual',
      },
      db,
    );
    const shares = db.select().from(share).where(eq(share.billId, bill.id)).all();
    expect(shares.map((s) => s.memberId).sort()).toEqual([admin.id, tenant.id].sort());
    expect(shares.map((s) => s.amountMinor)).toEqual([15000, 15000]);
    expect(
      splitView(hh.id, getService(hh.id, power.id, db)!, db).parts.map((p) => p.member.name),
    ).toEqual(['Admin', 'Tenant']);

    // The admin puts the boarder into the power split: three ways from now on.
    updateService(hh.id, power.id, { notSplitWith: [] }, db);
    const later = createBill(
      hh.id,
      {
        serviceId: power.id,
        amountMinor: 30000,
        periodStart: '2026-10-01',
        periodEnd: '2026-12-31',
        dueDate: '2027-01-20',
        source: 'manual',
      },
      db,
    );
    expect(db.select().from(share).where(eq(share.billId, later.id)).all()).toHaveLength(3);

    // Becoming a boarder leaves every split; a tenant made a boarder pays nothing new.
    setMemberRole(hh.id, tenant.id, 'boarder', db);
    expect(getService(hh.id, rent.id, db)!.notSplitWith.sort()).toEqual(
      [boarder.id, tenant.id].sort(),
    );
  });
});
