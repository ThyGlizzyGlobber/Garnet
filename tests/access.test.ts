import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { openDb, type Db } from '@/db/client';
import { runMigrations } from '@/db/migrate';
import {
  allowEmails,
  decideRequest,
  disallowEmail,
  earlyAccessOn,
  isAllowed,
  listAllowed,
  listRequests,
  maySignUp,
  requestAccess,
  seedAllowedFromAccounts,
  setEarlyAccess,
} from '@/lib/access';
import { signInAccount } from '@/lib/accounts';
import { resetEnvCache } from '@/lib/env';
import { createHousehold } from '@/lib/households';
import { createMember } from '@/lib/members';

let dir: string;
let db: Db;
let close: () => void;

beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hud-access-'));
  runMigrations(dir);
  const opened = openDb(dir);
  db = opened.db;
  close = () => opened.sqlite.close();
  process.env.DEVELOPER_EMAILS = 'dev@example.com';
  resetEnvCache();
});

afterAll(() => {
  close();
  fs.rmSync(dir, { recursive: true, force: true });
  delete process.env.DEVELOPER_EMAILS;
  resetEnvCache();
});

describe('early access (SCOPE-console.md §4)', () => {
  it('is on from the first build and lets in the listed, the invited, developers and existing accounts', () => {
    expect(earlyAccessOn(db)).toBe(true);
    expect(maySignUp('stranger@example.com', db)).toBe(false);
    expect(maySignUp('dev@example.com', db)).toBe(true);

    expect(
      allowEmails(
        ['Listed@Example.com', 'not-an-email', 'listed@example.com'],
        { accountId: null },
        db,
      ),
    ).toBe(1);
    expect(isAllowed('listed@example.com', db)).toBe(true);
    expect(maySignUp('LISTED@example.com', db)).toBe(true);

    const hh = createHousehold(
      {
        name: 'Invite House',
        currency: 'AUD',
        locale: 'en-AU',
        timezone: 'Australia/Melbourne',
        fiscalYearStartMonth: 7,
        splitMode: 'shared',
      },
      db,
    );
    createMember(hh.id, { name: 'Kim', email: 'kim@example.com', activeFrom: '2026-01-01' }, db);
    expect(maySignUp('kim@example.com', db)).toBe(true);

    // Signing up marks the listed address as used; an existing account always gets in.
    signInAccount({ email: 'listed@example.com' }, db);
    expect(listAllowed(db).find((a) => a.email === 'listed@example.com')?.usedAt).toBeTruthy();
    disallowEmail('listed@example.com', db);
    expect(isAllowed('listed@example.com', db)).toBe(false);
    expect(maySignUp('listed@example.com', db)).toBe(true);

    setEarlyAccess(false, db);
    expect(maySignUp('stranger@example.com', db)).toBe(true);
    setEarlyAccess(true, db);
    expect(maySignUp('stranger@example.com', db)).toBe(false);
  });

  it('takes one open request per address and lists the address when approved', () => {
    const first = requestAccess({ name: 'Pat', email: 'Pat@Example.com', message: 'From Jo' }, db);
    const again = requestAccess({ name: 'Pat again', email: 'pat@example.com', message: null }, db);
    expect(again.id).toBe(first.id);
    expect(listRequests(db).filter((r) => r.email === 'pat@example.com')).toHaveLength(1);

    const declined = decideRequest(first.id, 'declined', null, db)!;
    expect(declined.outcome).toBe('declined');
    expect(maySignUp('pat@example.com', db)).toBe(false);
    // Decided once: a second decision changes nothing.
    expect(decideRequest(first.id, 'approved', null, db)!.outcome).toBe('declined');

    const second = requestAccess({ name: 'Pat', email: 'pat@example.com', message: null }, db);
    expect(second.id).not.toBe(first.id);
    expect(decideRequest(second.id, 'approved', null, db)!.outcome).toBe('approved');
    expect(maySignUp('pat@example.com', db)).toBe(true);
    expect(decideRequest('nope', 'approved', null, db)).toBeNull();
  });

  it('lists everyone who already had an account when the switch first turns on', () => {
    signInAccount({ email: 'early@example.com' }, db);
    const n = seedAllowedFromAccounts(db);
    expect(n).toBeGreaterThanOrEqual(2); // early@ and dev@ at least
    expect(isAllowed('early@example.com', db)).toBe(true);
    expect(isAllowed('dev@example.com', db)).toBe(true);
    expect(seedAllowedFromAccounts(db)).toBe(0);
  });
});
