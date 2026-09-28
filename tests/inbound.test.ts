import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import worker, { sign as workerSign } from '../deploy/email-worker/worker.js';
import { openDb, type Db } from '@/db/client';
import { runMigrations } from '@/db/migrate';
import { getDocument } from '@/ingest/archive';
import { handleInboundEmail } from '@/ingest/inbound';
import {
  aliasFromRecipient,
  billsAddress,
  generateAlias,
  householdByAlias,
  replaceAlias,
  signDelivery,
  verifyDelivery,
} from '@/lib/bills-address';
import { parseEnv, resetEnvCache } from '@/lib/env';
import { createHousehold, getHousehold } from '@/lib/households';
import { resetRateLimits } from '@/lib/rate-limit';
import { billsWithAlerts, createBill, getBill, listBills, setBillAlert } from '@/lib/bills';
import { createMember } from '@/lib/members';
import { createService, getService, updateService } from '@/lib/services';
import { dkimKeys } from './helpers/dkim';
import { scriptAi } from './helpers/fake-ai';
import { listDocuments } from '@/lib/review';

const SECRET = 's'.repeat(40);
let dir: string;
let db: Db;
let close: () => void;

beforeAll(() => {
  process.env.BILLS_ADDRESS_TEMPLATE = '{alias}@bills.example.com';
  process.env.INBOUND_EMAIL_SECRET = SECRET;
  resetEnvCache();
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hud-inbound-'));
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
  delete process.env.INBOUND_MAX_PER_HOUR;
  resetEnvCache();
});

beforeEach(() => resetRateLimits());

const household = (name: string) =>
  createHousehold(
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

function email(opts: { subject: string; body: string; pdf?: Buffer }): Buffer {
  const head = [
    'From: Provider <billing@provider.example>',
    'To: someone@bills.example.com',
    `Subject: ${opts.subject}`,
    'Message-ID: <' + Math.random().toString(36).slice(2) + '@provider.example>',
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
      'Content-Type: application/pdf; name="bill.pdf"',
      'Content-Disposition: attachment; filename="bill.pdf"',
      'Content-Transfer-Encoding: base64',
      '',
      opts.pdf.toString('base64'),
      '--b1--',
      '',
    ].join('\r\n'),
  );
}

function delivery(to: string, body: Buffer, opts: { secret?: string; ts?: number } = {}) {
  const ts = String(opts.ts ?? Math.floor(Date.now() / 1000));
  return {
    headers: new Headers({
      'x-inbound-to': to,
      'x-timestamp': ts,
      'x-signature': signDelivery(opts.secret ?? SECRET, ts, body),
    }),
    body,
  };
}

describe('aliases and addresses', () => {
  it('are readable, unguessable and survive awkward names', () => {
    expect(generateAlias('Smith Household')).toMatch(/^smith-[2-9a-hjkmnp-z]{5}$/);
    expect(generateAlias("Heather's Place")).toMatch(/^heather-s-pl-[2-9a-hjkmnp-z]{5}$/);
    expect(generateAlias('The House')).toMatch(/^home-[2-9a-hjkmnp-z]{5}$/);
    expect(generateAlias('Café Ünïcode')).toMatch(/^cafe-unicode-[2-9a-hjkmnp-z]{5}$/);
  });

  it('are created on first use and can be replaced', () => {
    const hh = household('Address House');
    const first = billsAddress(hh, db)!;
    expect(first).toMatch(/^address-[2-9a-hjkmnp-z]{5}@bills\.example\.com$/);
    const again = billsAddress(getHousehold(hh.id, db)!, db);
    expect(again).toBe(first);
    const alias = replaceAlias(getHousehold(hh.id, db)!, db);
    expect(householdByAlias(first.split('@')[0]!, db)).toBeNull();
    expect(householdByAlias(alias, db)?.id).toBe(hh.id);
  });

  it('are parsed back from recipients for both address styles', () => {
    const plain = parseEnv({
      AUTH_SECRET: 'x'.repeat(32),
      BILLS_ADDRESS_TEMPLATE: '{alias}@brjlabs.com',
    });
    const plus = parseEnv({
      AUTH_SECRET: 'x'.repeat(32),
      BILLS_ADDRESS_TEMPLATE: 'bills+{alias}@bills.brjlabs.com',
    });
    expect(aliasFromRecipient('Smith-7K2F@BRJLABS.com', plain)).toBe('smith-7k2f');
    expect(aliasFromRecipient('Smith <smith-7k2f@brjlabs.com>', plain)).toBe('smith-7k2f');
    expect(aliasFromRecipient('smith-7k2f@other.com', plain)).toBeNull();
    expect(aliasFromRecipient('bills+smith-7k2f@bills.brjlabs.com', plus)).toBe('smith-7k2f');
    expect(aliasFromRecipient('bills@bills.brjlabs.com', plus)).toBeNull();
    expect(aliasFromRecipient('../../etc@brjlabs.com', plain)).toBeNull();
  });
});

describe('delivery signatures', () => {
  const body = Buffer.from('raw message');
  const now = 1_800_000_000;
  const sig = signDelivery(SECRET, String(now), body);

  it('accept a fresh, untampered delivery', () => {
    expect(verifyDelivery(SECRET, { timestamp: String(now), signature: sig }, body, now)).toBe(
      true,
    );
  });

  it('reject tampering, stale timestamps and the wrong secret', () => {
    expect(
      verifyDelivery(
        SECRET,
        { timestamp: String(now), signature: sig },
        Buffer.from('raw massage'),
        now,
      ),
    ).toBe(false);
    expect(
      verifyDelivery(SECRET, { timestamp: String(now), signature: sig }, body, now + 301),
    ).toBe(false);
    expect(
      verifyDelivery('t'.repeat(40), { timestamp: String(now), signature: sig }, body, now),
    ).toBe(false);
    expect(verifyDelivery(SECRET, { timestamp: null, signature: sig }, body, now)).toBe(false);
  });

  it('match what the Cloudflare Worker produces', async () => {
    const raw = new Uint8Array(Buffer.from('From: a\r\n\r\nhello'));
    expect(await workerSign(SECRET, '1800000000', raw)).toBe(
      signDelivery(SECRET, '1800000000', Buffer.from(raw)),
    );
  });
});

describe('the Worker', () => {
  const message = (to: string) => ({
    to,
    from: 'billing@provider.example',
    raw: new Blob(['From: a\r\n\r\nhello']).stream(),
    setReject: vi.fn(),
    forward: vi.fn(),
  });
  const env = {
    APP_INBOUND_URL: 'https://app.example/api/inbound/email',
    INBOUND_EMAIL_SECRET: SECRET,
  };

  it('posts the signed message and is done on 202', async () => {
    const fetchMock = vi.fn(async () => new Response('{}', { status: 202 }));
    vi.stubGlobal('fetch', fetchMock);
    const m = message('smith-7k2f@bills.example.com');
    await worker.email(m, env);
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers['X-Inbound-To']).toBe('smith-7k2f@bills.example.com');
    expect(
      verifyDelivery(
        SECRET,
        { timestamp: headers['X-Timestamp']!, signature: headers['X-Signature']! },
        Buffer.from(init.body as Uint8Array),
      ),
    ).toBe(true);
    expect(m.setReject).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('rejects unknown addresses, or forwards them when configured', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{}', { status: 404 })),
    );
    const a = message('nobody@bills.example.com');
    await worker.email(a, env);
    expect(a.setReject).toHaveBeenCalled();
    const b = message('hello@bills.example.com');
    await worker.email(b, { ...env, FORWARD_OTHER_TO: 'me@example.com' });
    expect(b.forward).toHaveBeenCalledWith('me@example.com');
    vi.unstubAllGlobals();
  });

  it('keeps the bill in the fallback inbox when the app is down', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('tunnel down');
      }),
    );
    const m = message('smith-7k2f@bills.example.com');
    await worker.email(m, { ...env, FALLBACK_TO: 'me@example.com' });
    expect(m.forward).toHaveBeenCalledWith('me@example.com');
    await expect(worker.email(message('x@bills.example.com'), env)).rejects.toThrow(/answered 0/);
    vi.unstubAllGlobals();
  });
});

describe('inbound deliveries', () => {
  it('archive an email-body bill into the right household and read it', async () => {
    const hh = household('Inbound House');
    const other = household('Other House');
    const to = billsAddress(hh, db)!;
    billsAddress(other, db);
    const raw = email({
      subject: 'Your water bill',
      body: 'Amount due $123.45 by 1 October 2026 for water.',
    });
    const res = await handleInboundEmail(delivery(to, raw), { db, waitForProcessing: true });
    expect(res).toEqual({ status: 202, body: { archived: 1, reading: 1 } });
    const docs = listDocuments(hh.id, {}, db);
    expect(docs).toHaveLength(1);
    expect(docs[0]?.emailSubject).toBe('Your water bill');
    expect(docs[0]?.status).toBe('needs_review');
    expect(listDocuments(other.id, {}, db)).toHaveLength(0);

    const dup = await handleInboundEmail(delivery(to, raw), { db, waitForProcessing: true });
    expect(dup.body).toEqual({ archived: 0, reading: 0 });
  });

  it('keep PDF attachments as their own documents and mark the email as the envelope', async () => {
    const hh = household('Attachment House');
    const pdf = Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(512, 3)]);
    const raw = email({ subject: 'Invoice attached', body: 'See attached.', pdf });
    const res = await handleInboundEmail(delivery(billsAddress(hh, db)!, raw), {
      db,
      waitForProcessing: true,
    });
    expect(res.body).toEqual({ archived: 2, reading: 1 });
    const docs = listDocuments(hh.id, {}, db);
    const envelope = docs.find((d) => d.kind === 'email')!;
    const attachment = docs.find((d) => d.kind === 'pdf')!;
    expect(getDocument(hh.id, envelope.id, db)?.status).toBe('ignored');
    expect(attachment.originalFilename).toBe('bill.pdf');
    expect(attachment.status).toBe('needs_review');
  });

  it('refuse bad signatures, unknown addresses and floods', async () => {
    const hh = household('Guarded House');
    const to = billsAddress(hh, db)!;
    const raw = email({ subject: 's', body: 'b' });
    expect(
      (await handleInboundEmail(delivery(to, raw, { secret: 'w'.repeat(40) }), { db })).status,
    ).toBe(401);
    expect(
      (await handleInboundEmail(delivery('nobody-abcde@bills.example.com', raw), { db })).status,
    ).toBe(404);
    expect((await handleInboundEmail(delivery('x@elsewhere.example', raw), { db })).status).toBe(
      404,
    );

    process.env.INBOUND_MAX_PER_HOUR = '2';
    resetEnvCache();
    const statuses = [];
    for (let i = 0; i < 3; i++)
      statuses.push(
        (await handleInboundEmail(delivery(to, email({ subject: `m${i}`, body: 'b' })), { db }))
          .status,
      );
    expect(statuses).toEqual([202, 202, 429]);
    delete process.env.INBOUND_MAX_PER_HOUR;
    resetEnvCache();
  });
});

describe('automatic bills from a bills address', () => {
  const { resolver, sign } = dkimKeys([
    'aussiebroadband.com.au',
    'attacker.example',
    'gmail.com',
    'billing-portal.example',
  ]);
  const invoice = (ref: string, from = 'Aussie Broadband <billing@aussiebroadband.com.au>') =>
    Buffer.from(
      [
        `From: ${from}`,
        'To: x@bills.example.com',
        'Subject: Your invoice',
        `Message-ID: <${ref}@aussiebroadband.com.au>`,
        'Content-Type: text/plain; charset=utf-8',
        '',
        fs
          .readFileSync(path.join(process.cwd(), 'tests/fixtures/aussie-broadband.txt'), 'utf8')
          .replaceAll('59259831', ref),
      ].join('\r\n'),
    );

  function setup(name: string) {
    const hh = household(name);
    const owner = createMember(hh.id, { name: 'Jo', role: 'owner', activeFrom: '2026-01-01' }, db);
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
    return { hh, svc, to: billsAddress(hh, db)! };
  }
  const reason = (hid: string, id: string) =>
    (JSON.parse(getDocument(hid, id, db)!.extractionJson!) as { reason: string }).reason;

  it('arrive automatically the first time when the sender plainly is the provider', async () => {
    const { hh, svc, to } = setup('Trust House');
    const first = await sign(invoice('71111111'), 'aussiebroadband.com.au');
    await handleInboundEmail(delivery(to, first), { db, waitForProcessing: true, resolver });
    expect(listBills(hh.id, {}, db).map((b) => b.externalRef)).toEqual(['71111111']);
    expect(getService(hh.id, svc.id, db)?.trustedSenders).toEqual(['aussiebroadband.com.au']);
  });

  it("wait for a look when the signing domain doesn't look like the provider", async () => {
    const { hh, to } = setup('Lookalike House');
    const odd = await sign(
      invoice('72222222', 'Aussie Broadband <billing@billing-portal.example>'),
      'billing-portal.example',
    );
    await handleInboundEmail(delivery(to, odd), { db, waitForProcessing: true, resolver });
    expect(listBills(hh.id, {}, db)).toHaveLength(0);
    const [doc] = listDocuments(hh.id, {}, db);
    expect(doc?.status).toBe('needs_review');
    expect(reason(hh.id, doc!.id)).toMatch(/doesn't look like Aussie Broadband/);
  });

  it('accept a bill a member forwards from their own mailbox', async () => {
    const { hh, to } = setup('Forwarded House');
    createMember(
      hh.id,
      { name: 'Kim', email: 'kim.member@gmail.com', activeFrom: '2026-01-01' },
      db,
    );
    const fwd = await sign(invoice('75555555', 'Kim <kim.member@gmail.com>'), 'gmail.com');
    await handleInboundEmail(delivery(to, fwd), { db, waitForProcessing: true, resolver });
    expect(listBills(hh.id, {}, db).map((b) => b.externalRef)).toEqual(['75555555']);
  });

  it('offer only the exact address, never gmail.com, for a stranger forwarding a bill', async () => {
    const { hh, to } = setup('Stranger House');
    const fwd = await sign(invoice('76666666', 'Someone <someone.else@gmail.com>'), 'gmail.com');
    await handleInboundEmail(delivery(to, fwd), { db, waitForProcessing: true, resolver });
    expect(listBills(hh.id, {}, db)).toHaveLength(0);
    const [doc] = listDocuments(hh.id, {}, db);
    expect(reason(hh.id, doc!.id)).toMatch(/came from someone\.else@gmail\.com/);
  });

  it('never trust unsigned or spoofed mail, even from a trusted domain', async () => {
    const { hh, svc, to } = setup('Spoof House');
    updateService(hh.id, svc.id, { trustedSenders: ['aussiebroadband.com.au'] }, db);
    await handleInboundEmail(delivery(to, invoice('73333333')), {
      db,
      waitForProcessing: true,
      resolver,
    });
    const spoof = await sign(invoice('74444444'), 'attacker.example');
    await handleInboundEmail(delivery(to, spoof), { db, waitForProcessing: true, resolver });
    expect(listBills(hh.id, {}, db)).toHaveLength(0);
    const reasons = listDocuments(hh.id, {}, db).map((d) => reason(hh.id, d.id));
    expect(reasons.every((r) => /isn't signed/.test(r))).toBe(true);
  });
});

describe('provider notices', () => {
  const { resolver, sign } = dkimKeys(['aussiebroadband.com.au', 'gmail.com']);
  const notice = (
    subject: string,
    body: string,
    from = 'Aussie Broadband <accounts@aussiebroadband.com.au>',
  ) =>
    Buffer.from(
      [
        `From: ${from}`,
        'To: x@bills.example.com',
        `Subject: ${subject}`,
        `Message-ID: <${Math.random().toString(36).slice(2)}@aussiebroadband.com.au>`,
        'Content-Type: text/plain; charset=utf-8',
        '',
        body,
      ].join('\r\n'),
    );

  function setupWithBill(name: string, paid: boolean) {
    const hh = household(name);
    const owner = createMember(
      hh.id,
      { name: 'Jo', role: 'owner', email: 'jo.owner@gmail.com', activeFrom: '2026-01-01' },
      db,
    );
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
    const b = createBill(
      hh.id,
      {
        serviceId: svc.id,
        amountMinor: 12900,
        periodStart: '2026-09-14',
        periodEnd: '2026-10-13',
        dueDate: '2026-09-28',
        source: 'manual',
        paidToProviderAt: paid ? '2026-09-28T00:00:00Z' : null,
      },
      db,
    );
    return { hh, bill: b, to: billsAddress(hh, db)! };
  }
  const deliver = async (to: string, raw: Buffer) =>
    handleInboundEmail(delivery(to, raw), { db, waitForProcessing: true, resolver });

  it('flag the bill when the provider says a payment failed, and un-mark it as paid', async () => {
    const { hh, bill: b, to } = setupWithBill('Failed Payment', true);
    await deliver(
      to,
      await sign(
        notice(
          'Your payment was unsuccessful',
          'We were unable to process your direct debit of $129.00.',
        ),
        'aussiebroadband.com.au',
      ),
    );
    const after = getBill(hh.id, b.id, db)!;
    expect(after.alertKind).toBe('payment_failed');
    expect(after.paidToProviderAt).toBeNull();
    const [doc] = listDocuments(hh.id, {}, db);
    expect(doc?.status).toBe('notice');
    expect(after.alertDocumentId).toBe(doc?.id);
    expect(billsWithAlerts(hh.id, db).map((x) => x.id)).toEqual([b.id]);
  });

  it('mark the bill paid and clear the flag when the provider confirms payment', async () => {
    const { hh, bill: b, to } = setupWithBill('Received Payment', false);
    setBillAlert(hh.id, b.id, 'overdue', null, db);
    await deliver(
      to,
      await sign(
        notice('Thanks for your payment', 'We have received your payment of $129.00.'),
        'aussiebroadband.com.au',
      ),
    );
    const after = getBill(hh.id, b.id, db)!;
    expect(after.paidToProviderAt).not.toBeNull();
    expect(after.alertKind).toBeNull();
  });

  it('act on a notice a member forwards, matching the provider by name', async () => {
    const { hh, bill: b, to } = setupWithBill('Forwarded Notice', true);
    await deliver(
      to,
      await sign(
        notice(
          'Fwd: Payment declined',
          'Aussie Broadband: your card payment was declined.',
          'Jo <jo.owner@gmail.com>',
        ),
        'gmail.com',
      ),
    );
    expect(getBill(hh.id, b.id, db)?.alertKind).toBe('payment_failed');
  });

  it('change nothing for an unsigned notice', async () => {
    const { hh, bill: b, to } = setupWithBill('Unsigned Notice', true);
    await deliver(to, notice('Payment unsuccessful', 'We could not process your payment.'));
    const after = getBill(hh.id, b.id, db)!;
    expect(after.alertKind).toBeNull();
    expect(after.paidToProviderAt).not.toBeNull();
    expect(listDocuments(hh.id, {}, db)[0]?.status).toBe('notice');
  });

  it('keep non-bill emails out of the review queue, but not unreadable bills', async () => {
    const { hh, to } = setupWithBill('Other Mail', true);
    await deliver(
      to,
      await sign(
        notice('Reset your password', 'Use the link below to reset your password.'),
        'aussiebroadband.com.au',
      ),
    );
    await deliver(
      to,
      await sign(
        notice('Your new bill', 'Your bill is ready. Amount due $88.10, pay by 3 November.'),
        'aussiebroadband.com.au',
      ),
    );
    const statuses = listDocuments(hh.id, {}, db)
      .map((d) => `${d.emailSubject}: ${d.status}`)
      .sort();
    expect(statuses).toEqual(['Reset your password: notice', 'Your new bill: needs_review']);
  });

  it('let the AI decide what an email is, whatever its subject says', async () => {
    const { hh, bill: b, to } = setupWithBill('AI Decides', true);
    scriptAi({
      document_type: 'other',
      provider: 'Aussie Broadband',
      service_type: null,
      bill: null,
      payment: null,
      confidence: 0.95,
      notes: null,
    });
    try {
      await deliver(
        to,
        await sign(
          notice('Payment unsuccessful? Never again', 'Our new app makes paying simple and quick.'),
          'aussiebroadband.com.au',
        ),
      );
    } finally {
      scriptAi(null);
    }
    expect(getBill(hh.id, b.id, db)?.alertKind).toBeNull();
    expect(listDocuments(hh.id, {}, db)[0]?.status).toBe('notice');
  });

  it('fall back to the subject line when the AI can’t read (limit used up)', async () => {
    process.env.AI_MONTHLY_LIMIT = '0';
    resetEnvCache();
    try {
      const { hh, bill: b, to } = setupWithBill('No AI Left', true);
      await deliver(
        to,
        await sign(
          notice('Payment unsuccessful', 'Please see the details in your account.'),
          'aussiebroadband.com.au',
        ),
      );
      expect(getBill(hh.id, b.id, db)?.alertKind).toBe('payment_failed');
    } finally {
      delete process.env.AI_MONTHLY_LIMIT;
      resetEnvCache();
    }
  });
});
