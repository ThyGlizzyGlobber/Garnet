import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import nextConfig from '../next.config';
import { openDb, type Db } from '@/db/client';
import { runMigrations } from '@/db/migrate';
import { archiveDocument, getDocument } from '@/ingest/archive';
import { processDocument } from '@/ingest/pipeline';
import { linkMember, signInAccount } from '@/lib/accounts';
import { createMember } from '@/lib/members';
import { countDevices, findDevice, forgetOtherDevices, trustDevice } from '@/lib/auth/devices';
import { uncapDeveloperHouseholds } from '@/lib/console';
import { resetEnvCache } from '@/lib/env';
import { createHousehold } from '@/lib/households';
import { IP_LIMITS, ipAllowed, resetRateLimits } from '@/lib/rate-limit';
import { contentDisposition, readBodyCapped, safeNext } from '@/lib/request';
import { AI_READ, aiAllowance, recordUsage, usageCount } from '@/lib/usage';

let dir: string;
let db: Db;
let close: () => void;

beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hud-hardening-'));
  runMigrations(dir);
  const opened = openDb(dir);
  db = opened.db;
  close = () => opened.sqlite.close();
});

afterAll(() => {
  close();
  fs.rmSync(dir, { recursive: true, force: true });
  delete process.env.AI_MONTHLY_LIMIT;
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

describe('safeNext', () => {
  it.each([
    ['/bills', '/bills'],
    ['/bills?status=unpaid#top', '/bills?status=unpaid#top'],
    ['/', '/'],
  ])('keeps same-site path %s', (input, out) => expect(safeNext(input)).toBe(out));

  it.each([
    'https://evil.example',
    '//evil.example',
    '/\\evil.example',
    '/\\/evil.example',
    '/ /evil.example',
    'javascript:alert(1)',
    'bills',
    '',
    null,
    undefined,
  ])('rejects %s', (input) => expect(safeNext(input)).toBeNull());
});

describe('download names', () => {
  it('keep any file name without breaking the header', () => {
    const v = contentDisposition('attachment', 'Rates – 2026 “final” 🏠.pdf');
    // Node refuses header values outside Latin-1; this must not throw.
    expect(() => new Headers({ 'Content-Disposition': v })).not.toThrow();
    expect(v).toBe(
      `attachment; filename="Rates _ 2026 _final_ _.pdf"; filename*=UTF-8''Rates%20%E2%80%93%202026%20%E2%80%9Cfinal%E2%80%9D%20%F0%9F%8F%A0.pdf`,
    );
  });
});

describe('request bodies from unauthenticated callers', () => {
  const post = (body: BodyInit, headers: Record<string, string> = {}) =>
    new Request('http://x/api', { method: 'POST', body, headers, duplex: 'half' } as RequestInit);
  it('are read up to the limit and no further', async () => {
    expect((await readBodyCapped(post('hello'), 10))?.toString()).toBe('hello');
    expect(await readBodyCapped(post('x'.repeat(11)), 10)).toBeNull();
    // No Content-Length (streamed): still stops at the limit.
    const stream = new ReadableStream({
      pull(c) {
        c.enqueue(new Uint8Array(8));
      },
    });
    expect(await readBodyCapped(post(stream), 64)).toBeNull();
  });
});

describe('per-network limits', () => {
  it('stop an address after the limit and keep others unaffected', () => {
    const now = Date.now();
    const { limit, windowMs } = IP_LIMITS.sendCode;
    for (let i = 0; i < limit; i++) expect(ipAllowed('sendCode', '203.0.113.9', now)).toBe(true);
    expect(ipAllowed('sendCode', '203.0.113.9', now)).toBe(false);
    expect(ipAllowed('sendCode', '198.51.100.7', now)).toBe(true);
    expect(ipAllowed('verifyCode', '203.0.113.9', now)).toBe(true);
    expect(ipAllowed('sendCode', '203.0.113.9', now + windowMs + 1)).toBe(true);
  });
});

describe('AI reading cap', () => {
  it('counts per household and per month', () => {
    const a = household('Cap A');
    const b = household('Cap B');
    const sept = Date.parse('2026-09-15T00:00:00Z');
    recordUsage(a.id, AI_READ, db, sept);
    recordUsage(a.id, AI_READ, db, sept);
    expect(usageCount(a.id, AI_READ, db, sept)).toBe(2);
    expect(usageCount(b.id, AI_READ, db, sept)).toBe(0);
    expect(usageCount(a.id, AI_READ, db, Date.parse('2026-10-01T00:00:00Z'))).toBe(0);
  });

  it('reports what is left against AI_MONTHLY_LIMIT', () => {
    process.env.AI_MONTHLY_LIMIT = '3';
    resetEnvCache();
    const hh = household('Allowance');
    recordUsage(hh.id, AI_READ, db);
    expect(aiAllowance(hh.id, db)).toEqual({ used: 1, limit: 3, left: 2 });
  });

  it('sends unknown bills to review with the reason once the month’s reads are used', async () => {
    process.env.AI_MONTHLY_LIMIT = '0';
    resetEnvCache();
    const hh = household('Over the cap');
    const { doc } = archiveDocument(
      hh.id,
      {
        kind: 'upload',
        buffer: Buffer.from('Some unknown provider bill for water usage, amount due soon.'),
        originalFilename: 'bill.txt',
        mimeType: 'text/plain',
      },
      db,
    );
    const outcome = await processDocument(hh.id, doc.id, db);
    expect(outcome.status).toBe('needs_review');
    const stored = JSON.parse(getDocument(hh.id, doc.id, db)!.extractionJson!) as {
      reason: string;
    };
    expect(stored.reason).toMatch(/limit is used up/);
    expect(usageCount(hh.id, AI_READ, db)).toBe(0);
  });

  it('gives the developers’ own households no cap (an explicit entry), and still counts their reads', () => {
    process.env.AI_MONTHLY_LIMIT = '0';
    process.env.DEVELOPER_EMAILS = 'Owner@Example.com';
    resetEnvCache();
    try {
      const mine = household('Operator home');
      const theirs = household('Family home');
      const put = (hid: string, email: string) => {
        const m = createMember(
          hid,
          { name: 'Someone', role: 'owner', activeFrom: '2026-01-01' },
          db,
        );
        const a = signInAccount({ email }, db);
        linkMember(m.id, a.id, a.email, db);
      };
      put(mine.id, 'owner@example.com');
      put(theirs.id, 'aunt@example.com');
      expect(uncapDeveloperHouseholds(db)).toBe(1);
      recordUsage(mine.id, AI_READ, db);
      expect(aiAllowance(mine.id, db)).toEqual({
        used: 1,
        limit: null,
        left: Number.POSITIVE_INFINITY,
      });
      expect(aiAllowance(theirs.id, db)).toEqual({ used: 0, limit: 0, left: 0 });
    } finally {
      delete process.env.DEVELOPER_EMAILS;
      resetEnvCache();
    }
  });
});

describe('unreadable files', () => {
  it('go to the review queue with a reason instead of failing the upload', async () => {
    const hh = household('Damaged');
    const { doc } = archiveDocument(
      hh.id,
      {
        kind: 'upload',
        buffer: Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(4096, 7)]),
        originalFilename: 'damaged.pdf',
        mimeType: 'application/pdf',
      },
      db,
    );
    const outcome = await processDocument(hh.id, doc.id, db);
    expect(outcome).toMatchObject({ status: 'needs_review', reason: 'unreadable' });
    expect(getDocument(hh.id, doc.id, db)?.status).toBe('needs_review');
  });
});

describe('sign out other devices', () => {
  it('keeps only the current browser', () => {
    const a = signInAccount({ email: 'phone-lost@example.com' }, db);
    const here = trustDevice(a.id, 'this laptop', db);
    const phone = trustDevice(a.id, 'lost phone', db);
    const other = signInAccount({ email: 'unrelated@example.com' }, db);
    const theirs = trustDevice(other.id, null, db);
    expect(countDevices(a.id, db)).toBe(2);
    expect(forgetOtherDevices(a.id, here.device.id, db)).toBe(1);
    expect(findDevice(here.token, a.id, db)).not.toBeNull();
    expect(findDevice(phone.token, a.id, db)).toBeNull();
    expect(findDevice(theirs.token, other.id, db)).not.toBeNull();
  });
});

describe('security headers', () => {
  it('forbid framing everywhere except archived files, and never leak referrers', async () => {
    const rules = await nextConfig.headers!();
    const pages = rules.find((r) => r.source.includes('?!api/documents'))!;
    const docs = rules.find((r) => r.source === '/api/documents/:path*')!;
    const get = (r: typeof pages, key: string) => r.headers.find((h) => h.key === key)?.value;
    expect(get(pages, 'X-Frame-Options')).toBe('DENY');
    expect(get(pages, 'Content-Security-Policy')).toContain("frame-ancestors 'none'");
    expect(get(pages, 'Referrer-Policy')).toBe('same-origin');
    expect(get(docs, 'X-Frame-Options')).toBeUndefined();
    expect(get(docs, 'X-Content-Type-Options')).toBe('nosniff');
  });
});
