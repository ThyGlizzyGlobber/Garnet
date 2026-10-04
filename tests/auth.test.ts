import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { openDb, type Db } from '@/db/client';
import { runMigrations } from '@/db/migrate';
import { account } from '@/db/schema';
import {
  accountGivenName,
  getAccount,
  isDeveloper,
  linkMember,
  listAccounts,
  membershipsFor,
  pickMember,
  rememberLastMember,
  setAccountPin,
  signInAccount,
  signInMethod,
  unclaimedOwners,
} from '@/lib/accounts';
import { CODE_MAX_ATTEMPTS, CODE_TTL_MS, issueLoginCode, verifyLoginCode } from '@/lib/auth/codes';
import { findDevice, PIN_MAX_FAILURES, recordPinFailure, trustDevice } from '@/lib/auth/devices';
import { checkClaims, completeSignIn, newAttempt } from '@/lib/auth/google';
import { normaliseTypedCode, randomTypedCode } from '@/lib/auth/tokens';
import { composeEmail, devOutbox, sendEmail } from '@/lib/email';
import { parseEnv, resetEnvCache } from '@/lib/env';
import { createHousehold } from '@/lib/households';
import {
  acceptInvite,
  createInvite,
  findInviteByCode,
  findInviteByToken,
  INVITE_TTL_MS,
  inviteState,
  latestInvites,
} from '@/lib/invites';
import { createMember, getMember, leaveBlocker, leaveHousehold, makePrimary } from '@/lib/members';
import { resetRateLimits } from '@/lib/rate-limit';

let dir: string;
let db: Db;
let close: () => void;

const household = (name: string, isDemo = false) =>
  createHousehold(
    {
      name,
      currency: 'AUD',
      locale: 'en-AU',
      timezone: 'Australia/Melbourne',
      fiscalYearStartMonth: 7,
      splitMode: 'shared',
      isDemo,
    },
    db,
  );

beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hud-auth-'));
  runMigrations(dir);
  const opened = openDb(dir);
  db = opened.db;
  close = () => opened.sqlite.close();
});

afterAll(() => {
  close();
  fs.rmSync(dir, { recursive: true, force: true });
});

beforeEach(() => resetRateLimits());

describe('accounts', () => {
  it('are created on first sign-in and reused by email, case-insensitively', () => {
    const a = signInAccount({ email: 'Aunt@Example.com', name: 'Aunt Jo' }, db);
    expect(a.email).toBe('aunt@example.com');
    expect(a.name).toBe('Aunt Jo');
    expect(signInAccount({ email: 'aunt@example.com' }, db).id).toBe(a.id);
  });

  it('record the Google subject and refuse a different one for the same email', () => {
    const a = signInAccount({ email: 'g@example.com', googleSub: 'sub-1' }, db);
    expect(a.googleSub).toBe('sub-1');
    expect(() => signInAccount({ email: 'g@example.com', googleSub: 'sub-2' }, db)).toThrow(
      /different Google account/,
    );
    // Found by subject even if Google reports a changed address.
    expect(signInAccount({ email: 'renamed@example.com', googleSub: 'sub-1' }, db).id).toBe(a.id);
  });

  it('greet by a real name only, never by the email prefix', () => {
    const byCode = signInAccount({ email: 'jo.bloggs@example.com' }, db);
    expect(byCode.name).toBe('jo.bloggs');
    expect(accountGivenName(byCode)).toBeNull();
    expect(signInMethod(byCode)).toBe('code');
    const byGoogle = signInAccount(
      { email: 'pat@example.com', name: 'Pat Lee', googleSub: 'sub-pat' },
      db,
    );
    expect(accountGivenName(byGoogle)).toBe('Pat Lee');
    expect(signInMethod(byGoogle)).toBe('google');
    expect(accountGivenName({ name: '  ', email: 'x@example.com' })).toBeNull();
  });

  it('are all listed for the operator, newest first, with their households', () => {
    const hh = household('Listed House');
    const a = signInAccount({ email: 'listed@example.com' }, db);
    const m = createMember(hh.id, { name: 'Lis', activeFrom: '2026-01-01' }, db);
    linkMember(m.id, a.id, a.email, db);
    const all = listAccounts(db);
    expect(all[0]!.email).toBe('listed@example.com');
    expect(all[0]!.households).toEqual([{ id: hh.id, name: 'Listed House', member: 'Lis' }]);
    expect(all.find((x) => x.email === 'jo.bloggs@example.com')!.households).toEqual([]);
    expect(new Set(all.map((x) => x.method))).toEqual(new Set(['code', 'google']));
  });

  it('made in the same instant are listed in the order they were added, newest first', () => {
    const first = signInAccount({ email: 'tie-first@example.com' }, db);
    const second = signInAccount({ email: 'tie-second@example.com' }, db);
    // The same millisecond: the time alone can't order them.
    const at = '2031-01-01T00:00:00.000Z';
    for (const a of [first, second])
      db.update(account).set({ createdAt: at }).where(eq(account.id, a.id)).run();
    expect(
      listAccounts(db)
        .slice(0, 2)
        .map((x) => x.email),
    ).toEqual(['tie-second@example.com', 'tie-first@example.com']);
    // Put them back so later tests see them at their real time.
    for (const a of [first, second])
      db.update(account).set({ createdAt: a.createdAt }).where(eq(account.id, a.id)).run();
  });

  it('are operators only when listed in DEVELOPER_EMAILS', () => {
    process.env.DEVELOPER_EMAILS = 'Owner@Example.com, other@example.com';
    resetEnvCache();
    expect(isDeveloper({ email: 'owner@example.com' })).toBe(true);
    expect(isDeveloper({ email: 'someone@example.com' })).toBe(false);
    delete process.env.DEVELOPER_EMAILS;
    resetEnvCache();
    expect(isDeveloper({ email: 'owner@example.com' })).toBe(false);
  });
});

describe('emailed sign-in codes', () => {
  it('verify once', () => {
    const issued = issueLoginCode('code@example.com', db);
    expect(issued.ok).toBe(true);
    if (!issued.ok) return;
    expect(verifyLoginCode('CODE@example.com', issued.code, db)).toEqual({ ok: true });
    expect(verifyLoginCode('code@example.com', issued.code, db).ok).toBe(false);
  });

  it('retire after too many wrong guesses', () => {
    const issued = issueLoginCode('guess@example.com', db);
    if (!issued.ok) throw new Error('not issued');
    const wrong = issued.code === '000000' ? '111111' : '000000';
    for (let i = 1; i < CODE_MAX_ATTEMPTS; i++)
      expect(verifyLoginCode('guess@example.com', wrong, db)).toEqual({
        ok: false,
        reason: 'invalid',
      });
    expect(verifyLoginCode('guess@example.com', wrong, db)).toEqual({
      ok: false,
      reason: 'too-many-attempts',
    });
    expect(verifyLoginCode('guess@example.com', issued.code, db).ok).toBe(false);
  });

  it('expire', () => {
    const now = Date.now();
    const issued = issueLoginCode('late@example.com', db, now);
    if (!issued.ok) throw new Error('not issued');
    expect(verifyLoginCode('late@example.com', issued.code, db, now + CODE_TTL_MS + 1)).toEqual({
      ok: false,
      reason: 'expired',
    });
  });

  it('are rate-limited and a new code replaces the old one', () => {
    const now = Date.now();
    const first = issueLoginCode('rate@example.com', db, now);
    expect(issueLoginCode('rate@example.com', db, now + 1000)).toEqual({
      ok: false,
      reason: 'rate-limited',
    });
    const second = issueLoginCode('rate@example.com', db, now + 61_000);
    if (!first.ok || !second.ok) throw new Error('not issued');
    if (first.code !== second.code)
      expect(verifyLoginCode('rate@example.com', first.code, db, now + 62_000).ok).toBe(false);
    expect(verifyLoginCode('rate@example.com', second.code, db, now + 62_000).ok).toBe(true);
  });
});

describe('trusted devices', () => {
  it('match only their own account and expire', () => {
    const a = signInAccount({ email: 'dev@example.com' }, db);
    const b = signInAccount({ email: 'other-dev@example.com' }, db);
    const now = Date.now();
    const { token } = trustDevice(a.id, 'Safari', db, now);
    expect(findDevice(token, a.id, db, now)?.label).toBe('Safari');
    expect(findDevice(token, b.id, db, now)).toBeNull();
    expect(findDevice('not-a-token', a.id, db, now)).toBeNull();
    expect(findDevice(token, a.id, db, now + 181 * 86_400_000)).toBeNull();
  });

  it('are forgotten after too many wrong PINs', () => {
    const a = signInAccount({ email: 'pin@example.com' }, db);
    const { device, token } = trustDevice(a.id, null, db);
    for (let i = 1; i < PIN_MAX_FAILURES; i++)
      expect(recordPinFailure(device.id, db)).toEqual({
        forgotten: false,
        remaining: PIN_MAX_FAILURES - i,
      });
    expect(recordPinFailure(device.id, db).forgotten).toBe(true);
    expect(findDevice(token, a.id, db)).toBeNull();
  });
});

describe('invitations', () => {
  it('accept by link once, linking the account to the invited member', () => {
    const hh = household('Invite House');
    const admin = createMember(
      hh.id,
      { name: 'Admin', role: 'owner', activeFrom: '2026-01-01' },
      db,
    );
    const sam = createMember(hh.id, { name: 'Sam', activeFrom: '2026-01-01' }, db);
    const issued = createInvite(
      hh.id,
      sam.id,
      { email: 'sam@example.com', createdByMemberId: admin.id },
      db,
    );
    const found = findInviteByToken(issued.token, db);
    expect(found?.household.name).toBe('Invite House');
    expect(found?.invitedBy?.name).toBe('Admin');
    expect(getMember(hh.id, sam.id, db)?.email).toBe('sam@example.com');

    const account = signInAccount({ email: 'sam@example.com' }, db);
    const joined = acceptInvite(issued.invite.id, account.id, account.email, db);
    expect(joined.accountId).toBe(account.id);
    expect(joined.pinHash).toBeNull();
    expect(membershipsFor(account.id, db).map((m) => m.id)).toEqual([sam.id]);
    expect(findInviteByToken(issued.token, db)).toBeNull();
    expect(inviteState(latestInvites(hh.id, db).get(sam.id))).toBe('accepted');
    expect(() => createInvite(hh.id, sam.id, {}, db)).toThrow(/already joined/);
  });

  it('accept by typed code, forgiving case, spaces and look-alike letters', () => {
    const hh = household('Code House');
    const jo = createMember(hh.id, { name: 'Jo', activeFrom: '2026-01-01' }, db);
    const issued = createInvite(hh.id, jo.id, {}, db);
    const typed = issued.code.toLowerCase().replace('-', ' ').replace(/0/g, 'o');
    expect(findInviteByCode(typed, db)?.member.id).toBe(jo.id);
    expect(findInviteByCode('ZZZZ-ZZZZ', db)).toBeNull();
  });

  it('stop working when replaced or expired', () => {
    const hh = household('Expiry House');
    const kim = createMember(hh.id, { name: 'Kim', activeFrom: '2026-01-01' }, db);
    const now = Date.now();
    const first = createInvite(hh.id, kim.id, {}, db, now);
    const second = createInvite(hh.id, kim.id, {}, db, now);
    expect(findInviteByToken(first.token, db, now)).toBeNull();
    expect(findInviteByCode(first.code, db, now)).toBeNull();
    expect(findInviteByToken(second.token, db, now)).not.toBeNull();
    expect(findInviteByToken(second.token, db, now + INVITE_TTL_MS + 1)).toBeNull();
  });

  it('let one account join several households, the first joined being primary', () => {
    const one = household('First House');
    const two = household('Second House');
    const a = createMember(one.id, { name: 'A', activeFrom: '2026-01-01' }, db);
    const b = createMember(two.id, { name: 'B', activeFrom: '2026-01-01' }, db);
    const account = signInAccount({ email: 'busy@example.com' }, db);
    acceptInvite(createInvite(one.id, a.id, {}, db).invite.id, account.id, account.email, db);
    acceptInvite(createInvite(two.id, b.id, {}, db).invite.id, account.id, account.email, db);
    const mine = membershipsFor(account.id, db);
    expect(mine.map((m) => m.householdId)).toEqual([one.id, two.id]);
    expect(mine.map((m) => m.isPrimary)).toEqual([true, false]);
    // Which one opens: asked for, else primary, else last used, else the first joined.
    expect(pickMember(mine, mine[1]!.id, null)?.id).toBe(mine[1]!.id);
    expect(pickMember(mine, 'not-mine', null)?.id).toBe(mine[0]!.id);
    makePrimary(account.id, mine[1]!.id, db);
    const after = membershipsFor(account.id, db);
    expect(after.map((m) => m.isPrimary)).toEqual([false, true]);
    expect(pickMember(after, undefined, after[0]!.id)?.id).toBe(after[1]!.id);
    const neither = after.map((m) => ({ ...m, isPrimary: false }));
    expect(pickMember(neither, undefined, after[0]!.id)?.id).toBe(after[0]!.id);
    expect(pickMember(neither, undefined, null)?.id).toBe(after[0]!.id);
    expect(() => makePrimary(account.id, 'not-mine', db)).toThrow();
  });

  it('refuse the same member twice', () => {
    const hh = household('Twice House');
    const a = createMember(hh.id, { name: 'A', activeFrom: '2026-01-01' }, db);
    const account = signInAccount({ email: 'twice@example.com' }, db);
    acceptInvite(createInvite(hh.id, a.id, {}, db).invite.id, account.id, account.email, db);
    expect(() => createInvite(hh.id, a.id, {}, db)).toThrow(/already joined/);
  });

  it('can only be created for a member of the same household', () => {
    const one = household('One');
    const two = household('Two');
    const outsider = createMember(two.id, { name: 'Out', activeFrom: '2026-01-01' }, db);
    expect(() => createInvite(one.id, outsider.id, {}, db)).toThrow(/not found/);
  });
});

describe('the account', () => {
  it('holds the PIN and remembers only its own households', () => {
    const account = signInAccount({ email: 'pinned@example.com' }, db);
    expect(account.pinHash).toBeNull();
    setAccountPin(account.id, 'hash-1', db);
    expect(getAccount(account.id, db)?.pinHash).toBe('hash-1');
    const hh = household('Remember House');
    const me = createMember(
      hh.id,
      { name: 'Me', activeFrom: '2026-01-01', accountId: account.id },
      db,
    );
    const stranger = createMember(hh.id, { name: 'Stranger', activeFrom: '2026-01-01' }, db);
    rememberLastMember(account.id, stranger.id, db);
    expect(getAccount(account.id, db)?.lastMemberId).toBeNull();
    rememberLastMember(account.id, me.id, db);
    expect(getAccount(account.id, db)?.lastMemberId).toBe(me.id);
  });
});

describe('leaving a household', () => {
  it('needs shares settled, no personal things, and never the last admin', () => {
    const hh = household('Leaving House');
    const account = signInAccount({ email: 'leaver@example.com' }, db);
    const admin = createMember(
      hh.id,
      {
        name: 'Admin',
        role: 'owner',
        activeFrom: '2026-01-01',
        accountId: account.id,
        isPrimary: true,
      },
      db,
    );
    expect(leaveBlocker(hh.id, admin, db)).toBe('lastAdmin');
    const other = signInAccount({ email: 'other-leaver@example.com' }, db);
    const sam = createMember(
      hh.id,
      { name: 'Sam', activeFrom: '2026-01-01', accountId: other.id },
      db,
    );
    expect(leaveBlocker(hh.id, sam, db)).toBeNull();
    leaveHousehold(hh.id, sam, '2026-10-01', db);
    const gone = getMember(hh.id, sam.id, db)!;
    expect(gone.accountId).toBeNull();
    expect(gone.activeTo).toBe('2026-10-01');
    expect(membershipsFor(other.id, db)).toEqual([]);
    expect(() => leaveHousehold(hh.id, admin, '2026-10-01', db)).toThrow(/lastAdmin/);
  });
});

describe('legacy owners', () => {
  it('are claimable only in real households, only while unlinked and with a PIN', () => {
    const real = household('Pre-accounts House');
    const demo = household('Demo House', true);
    const owner = createMember(
      real.id,
      { name: 'Bejay', role: 'owner', pinHash: 'hash', activeFrom: '2026-01-01' },
      db,
    );
    createMember(
      demo.id,
      { name: 'Alex', role: 'owner', pinHash: 'hash', activeFrom: '2026-01-01' },
      db,
    );
    const ids = () => unclaimedOwners(db).map((m) => m.id);
    expect(ids()).toContain(owner.id);
    expect(unclaimedOwners(db).every((m) => m.householdName !== 'Demo House')).toBe(true);
    const account = signInAccount({ email: 'operator@example.com' }, db);
    linkMember(owner.id, account.id, account.email, db);
    expect(ids()).not.toContain(owner.id);
  });
});

describe('Google ID token claims', () => {
  const base = {
    iss: 'https://accounts.google.com',
    aud: 'client-1',
    exp: Math.floor(Date.now() / 1000) + 600,
    nonce: 'n-1',
    sub: '1234',
    email: 'Person@Gmail.com',
    email_verified: true,
    name: 'Person',
  };
  const expected = { clientId: 'client-1', nonce: 'n-1' };

  it('accept a valid token', () => {
    expect(checkClaims(base, expected)).toEqual({
      sub: '1234',
      email: 'person@gmail.com',
      name: 'Person',
    });
  });

  it.each([
    ['issuer', { iss: 'https://evil.example' }, /issuer/],
    ['audience', { aud: 'someone-else' }, /not issued for this app/],
    ['expiry', { exp: 1 }, /expired/],
    ['nonce', { nonce: 'other' }, /did not match/],
    ['unverified email', { email_verified: false }, /verified/],
  ])('reject a wrong %s', (_label, patch, message) => {
    expect(() => checkClaims({ ...base, ...patch }, expected)).toThrow(message);
  });

  it('exchange the code and check state first', async () => {
    const env = parseEnv({
      AUTH_SECRET: 'x'.repeat(32),
      GOOGLE_CLIENT_ID: 'client-1',
      GOOGLE_CLIENT_SECRET: 'secret',
      APP_URL: 'https://home.example.com',
    });
    const attempt = { ...newAttempt(), nonce: 'n-1' };
    const idToken = `h.${Buffer.from(JSON.stringify(base)).toString('base64url')}.s`;
    let body = '';
    const fetchImpl = (async (_url: string, init: RequestInit) => {
      body = String(init.body);
      return new Response(JSON.stringify({ id_token: idToken }), { status: 200 });
    }) as unknown as typeof fetch;
    await expect(
      completeSignIn({ code: 'c', state: 'wrong' }, attempt, { env, fetchImpl }),
    ).rejects.toThrow(/did not match/);
    const id = await completeSignIn({ code: 'c', state: attempt.state }, attempt, {
      env,
      fetchImpl,
    });
    expect(id.email).toBe('person@gmail.com');
    expect(body).toContain('code_verifier=');
    expect(body).toContain(encodeURIComponent('https://home.example.com/api/auth/google/callback'));
  });
});

describe('typed codes', () => {
  it('look like XXXX-XXXX and normalise what people type', () => {
    expect(randomTypedCode()).toMatch(/^[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/);
    expect(normaliseTypedCode(' k7m4 qx2p ')).toBe('K7M4-QX2P');
    expect(normaliseTypedCode('abcd-l0io')).toBe('ABCD-1010');
  });
});

describe('email', () => {
  it('is kept in the dev outbox when no sending service is configured', async () => {
    const before = devOutbox.length;
    const r = await sendEmail(
      composeEmail({ to: 'x@example.com', subject: 'Hi', blocks: [{ p: 'Hello' }] }),
    );
    expect(r).toEqual({ sent: true });
    expect(devOutbox.length).toBe(before + 1);
  });

  it('escapes HTML and keeps blocks in order', () => {
    const e = composeEmail({
      to: 'x@example.com',
      subject: 's',
      blocks: [
        { p: '<b>Tom & Jo</b>' },
        { button: { label: 'Go', href: 'https://a.example/?a=1&b=2' } },
        { code: 'K7M4-QX2P' },
      ],
    });
    expect(e.html).toContain('&lt;b&gt;Tom &amp; Jo&lt;/b&gt;');
    expect(e.html).toContain('href="https://a.example/?a=1&amp;b=2"');
    expect(e.text.indexOf('Go:')).toBeLessThan(e.text.indexOf('K7M4-QX2P'));
  });
});

describe('pasted keys', () => {
  it('ignore surrounding spaces and treat blank as unset', () => {
    const base = { DATA_DIR: '/tmp/x', AUTH_SECRET: 'a'.repeat(40) };
    expect(parseEnv({ ...base, ANTHROPIC_API_KEY: '  sk-ant-test\n' }).ANTHROPIC_API_KEY).toBe(
      'sk-ant-test',
    );
    expect(parseEnv({ ...base, ANTHROPIC_API_KEY: '   ' }).ANTHROPIC_API_KEY).toBeUndefined();
    expect(
      parseEnv({ ...base, ANTHROPIC_WORKSPACE_ID: '' }).ANTHROPIC_WORKSPACE_ID,
    ).toBeUndefined();
  });
});
