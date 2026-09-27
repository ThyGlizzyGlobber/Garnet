import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { simpleParser } from 'mailparser';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { openDb, type Db } from '@/db/client';
import { runMigrations } from '@/db/migrate';
import { handleInboundEmail } from '@/ingest/inbound';
import { billsAddress, signDelivery } from '@/lib/bills-address';
import { devOutbox } from '@/lib/email';
import { resetEnvCache } from '@/lib/env';
import {
  activeForwards,
  composeForward,
  confirmForward,
  CONFIRM_TTL_MS,
  disableForward,
  FORWARD_HEADER,
  getForward,
  isOurForward,
  setForward,
} from '@/lib/forwarding';
import { createHousehold } from '@/lib/households';
import { createMember } from '@/lib/members';
import { resetRateLimits } from '@/lib/rate-limit';
import { createService } from '@/lib/services';

const SECRET = 'f'.repeat(40);
let dir: string;
let db: Db;
let close: () => void;

beforeAll(() => {
  process.env.BILLS_ADDRESS_TEMPLATE = '{alias}@bills.example.com';
  process.env.INBOUND_EMAIL_SECRET = SECRET;
  resetEnvCache();
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hud-forward-'));
  runMigrations(dir);
  const opened = openDb(dir);
  db = opened.db;
  close = () => opened.sqlite.close();
});

afterAll(() => {
  close();
  fs.rmSync(dir, { recursive: true, force: true });
  delete process.env.BILLS_ADDRESS_TEMPLATE;
  delete process.env.INBOUND_EMAIL_SECRET;
  resetEnvCache();
});

beforeEach(() => resetRateLimits());

function setup(name: string) {
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
  const m = createMember(hh.id, { name: 'Jo', role: 'owner', activeFrom: '2026-01-01' }, db);
  return { hh, m, address: billsAddress(hh, db)! };
}

function email(opts: { subject: string; body: string; extraHeaders?: string[]; pdf?: Buffer }) {
  const head = [
    'From: Aussie Broadband <accounts@provider.example>',
    'To: x@bills.example.com',
    `Subject: ${opts.subject}`,
    `Message-ID: <${Math.random().toString(36).slice(2)}@provider.example>`,
    ...(opts.extraHeaders ?? []),
    'MIME-Version: 1.0',
  ];
  if (!opts.pdf)
    return Buffer.from(
      [...head, 'Content-Type: text/plain; charset=utf-8', '', opts.body].join('\r\n'),
    );
  return Buffer.from(
    [
      ...head,
      'Content-Type: multipart/mixed; boundary="b1"',
      '',
      '--b1',
      'Content-Type: text/plain; charset=utf-8',
      '',
      opts.body,
      '--b1',
      'Content-Type: application/pdf; name="notice.pdf"',
      'Content-Disposition: attachment; filename="notice.pdf"',
      'Content-Transfer-Encoding: base64',
      '',
      opts.pdf.toString('base64'),
      '--b1--',
      '',
    ].join('\r\n'),
  );
}

async function deliver(to: string, body: Buffer) {
  const ts = String(Math.floor(Date.now() / 1000));
  return handleInboundEmail(
    {
      headers: new Headers({
        'x-inbound-to': to,
        'x-timestamp': ts,
        'x-signature': signDelivery(SECRET, ts, body),
      }),
      body,
    },
    { db, waitForProcessing: true },
  );
}

const sentTo = (addr: string) => devOutbox.filter((e) => e.to === addr);

describe('forwarding settings', () => {
  it('is active at once for the sign-in email', () => {
    const { hh, m } = setup('Own Email');
    const { forward, token } = setForward(
      hh.id,
      m.id,
      { email: 'Jo@Example.com', mode: 'all', accountEmail: 'jo@example.com' },
      db,
    );
    expect(token).toBeNull();
    expect(forward.email).toBe('jo@example.com');
    expect(forward.verifiedAt).not.toBeNull();
    expect(activeForwards(hh.id, db)).toHaveLength(1);
  });

  it('needs confirmation for any other address, which expires', () => {
    const { hh, m } = setup('Other Email');
    const now = Date.now();
    const { token } = setForward(
      hh.id,
      m.id,
      { email: 'personal@example.com', mode: 'all', accountEmail: 'jo@example.com' },
      db,
      now,
    );
    expect(token).not.toBeNull();
    expect(activeForwards(hh.id, db)).toHaveLength(0);
    expect(confirmForward(token!, db, now + CONFIRM_TTL_MS + 1)).toBeNull();
    expect(confirmForward(token!, db, now)?.email).toBe('personal@example.com');
    expect(confirmForward(token!, db, now)).toBeNull();
    expect(activeForwards(hh.id, db)).toHaveLength(1);

    // Changing only the mode keeps the confirmed address confirmed.
    const again = setForward(
      hh.id,
      m.id,
      { email: 'personal@example.com', mode: 'non_bills', accountEmail: 'jo@example.com' },
      db,
    );
    expect(again.token).toBeNull();
    expect(again.forward.mode).toBe('non_bills');
    disableForward(hh.id, m.id, db);
    expect(getForward(hh.id, m.id, db)).toBeNull();
  });
});

describe('forwarded copies', () => {
  it('keep content and attachments, reply to the sender, and are marked as ours', async () => {
    const pdf = Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(64, 1)]);
    const mail = await simpleParser(
      email({
        subject: 'Reset your password',
        body: 'Click https://provider.example/reset?t=abc',
        pdf,
      }),
    );
    const out = composeForward(mail, {
      to: 'me@example.com',
      billsAddress: 'smith-7k2f@bills.example.com',
      banner: 'Forwarded from smith-7k2f@bills.example.com',
    });
    expect(out.subject).toBe('Fwd: Reset your password');
    expect(out.replyTo).toBe('accounts@provider.example');
    expect(out.headers?.[FORWARD_HEADER]).toBe('smith-7k2f@bills.example.com');
    expect(out.text).toContain('https://provider.example/reset?t=abc');
    expect(out.html).toContain('Forwarded from smith-7k2f@bills.example.com');
    expect(out.attachments?.map((a) => a.filename)).toEqual(['notice.pdf']);
  });

  it('are recognised when they come back, so nothing loops', async () => {
    const looped = await simpleParser(
      email({
        subject: 'Fwd: x',
        body: 'y',
        extraHeaders: [`${FORWARD_HEADER}: smith@bills.example.com`],
      }),
    );
    expect(isOurForward(looped)).toBe(true);
    expect(isOurForward(await simpleParser(email({ subject: 'x', body: 'y' })))).toBe(false);
  });
});

describe('inbound mail is forwarded', () => {
  it('in "every email" mode, once, to confirmed members only', async () => {
    const { hh, m, address } = setup('Every Email');
    const other = createMember(hh.id, { name: 'Sam', activeFrom: '2026-01-01' }, db);
    setForward(
      hh.id,
      m.id,
      { email: 'jo@example.com', mode: 'all', accountEmail: 'jo@example.com' },
      db,
    );
    setForward(
      hh.id,
      other.id,
      { email: 'sam-unconfirmed@example.com', mode: 'all', accountEmail: 'sam@example.com' },
      db,
    );
    const raw = email({
      subject: 'Reset your password',
      body: 'Use this link to reset your password.',
    });
    await deliver(address, raw);
    expect(sentTo('jo@example.com').map((e) => e.subject)).toEqual(['Fwd: Reset your password']);
    expect(sentTo('sam-unconfirmed@example.com')).toHaveLength(0);
    await deliver(address, raw);
    expect(sentTo('jo@example.com')).toHaveLength(1);
  });

  it('in "only non-bills" mode, skipping mail that was read as a bill', async () => {
    const { hh, m, address } = setup('Non Bills');
    createService(
      hh.id,
      { typeSlug: 'internet', name: 'Internet', provider: 'Aussie Broadband', payerMemberId: m.id },
      db,
    );
    setForward(
      hh.id,
      m.id,
      { email: 'nonbills@example.com', mode: 'non_bills', accountEmail: 'nonbills@example.com' },
      db,
    );
    const invoice = fs
      .readFileSync(path.join(process.cwd(), 'tests/fixtures/aussie-broadband.txt'), 'utf8')
      .replaceAll('59259831', '64444444');
    await deliver(address, email({ subject: 'Your invoice', body: invoice }));
    await deliver(
      address,
      email({ subject: 'Your plan is changing', body: 'We are changing your plan next month.' }),
    );
    expect(sentTo('nonbills@example.com').map((e) => e.subject)).toEqual([
      'Fwd: Your plan is changing',
    ]);
  });

  it('never re-forwards our own forwards', async () => {
    const { hh, m, address } = setup('Loop');
    setForward(
      hh.id,
      m.id,
      { email: 'loop@example.com', mode: 'all', accountEmail: 'loop@example.com' },
      db,
    );
    await deliver(
      address,
      email({ subject: 'Fwd: x', body: 'y', extraHeaders: [`${FORWARD_HEADER}: ${address}`] }),
    );
    expect(sentTo('loop@example.com')).toHaveLength(0);
  });
});
