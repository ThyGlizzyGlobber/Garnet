import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { openDb, type Db } from '@/db/client';
import { runMigrations } from '@/db/migrate';
import { archiveDocument, getDocument, readDocument } from '@/ingest/archive';
import type { ExtractionInput, Extractor } from '@/ingest/extractors/types';
import { buildInput, processDocument, runExtractors } from '@/ingest/pipeline';
import { htmlToText } from '@/ingest/text/html';
import { extractText } from '@/ingest/text';
import { createHousehold } from '@/lib/households';
import { createMember } from '@/lib/members';
import { createService } from '@/lib/services';
import { resetEnvCache } from '@/lib/env';

describe('html to text', () => {
  it('strips tags and keeps line breaks', () => {
    const t = htmlToText(
      '<html><body><h1>Bill</h1><p>Amount due: <b>$10.00</b></p><table><tr><td>Due</td><td>1 Jul 2026</td></tr></table></body></html>',
    );
    expect(t).toBe('Bill\nAmount due: $10.00\nDue 1 Jul 2026');
  });
});

describe('email text', () => {
  const raw = (inner = '') =>
    Buffer.from(
      [
        'DKIM-Signature: v=1; a=rsa-sha256; d=gmail.com; b=AbCdEf0123456789==',
        'From: Lisa <lisa@example.com>',
        'To: bills@example.com',
        'Subject: Fwd: Your AGL gas bill',
        'Date: Mon, 28 Sep 2026 04:31:13 +0000',
        'MIME-Version: 1.0',
        'Content-Type: multipart/mixed; boundary="b1"',
        '',
        '--b1',
        'Content-Type: text/html; charset=utf-8',
        'Content-Transfer-Encoding: quoted-printable',
        '',
        '<p>Amount due: <b>$212.40</b></p><table><tr><td>Due date</td><td>14 Oct =',
        '2026</td></tr></table>',
        ...(inner
          ? ['--b1', 'Content-Type: message/rfc822', 'Content-Disposition: attachment', '', inner]
          : []),
        '--b1--',
        '',
      ].join('\r\n'),
    );

  it('is the readable message, not the raw source', async () => {
    const t = await extractText(raw(), 'message/rfc822', 'Fwd: Your AGL gas bill.eml');
    expect(t).toContain('Subject: Fwd: Your AGL gas bill');
    expect(t).toContain('Amount due: $212.40');
    expect(t).toContain('Due date 14 Oct 2026');
    expect(t).not.toContain('DKIM');
    expect(t).not.toContain('quoted-printable');
  });

  it('includes an email forwarded as an attachment', async () => {
    const inner = [
      'From: AGL <billing@agl.com.au>',
      'Subject: Your AGL gas bill',
      'Content-Type: text/plain; charset=utf-8',
      '',
      'Gas account 1234. Total due $212.40.',
    ].join('\r\n');
    const t = await extractText(raw(inner), 'message/rfc822', 'x.eml');
    expect(t).toContain('--- Attached email ---');
    expect(t).toContain('<billing@agl.com.au>');
    expect(t).toContain('Total due $212.40.');
  });
});

describe('archive + pipeline', () => {
  let dir: string;
  let db: Db;
  let hid: string;
  let close: () => void;
  let net: string;

  beforeAll(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hud-ingest-'));
    process.env.DATA_DIR = dir;
    process.env.ANTHROPIC_API_KEY = '';
    resetEnvCache();
    runMigrations(dir);
    const o = openDb(dir);
    db = o.db;
    close = () => o.sqlite.close();
    hid = createHousehold(
      {
        name: 'H',
        currency: 'AUD',
        locale: 'en-AU',
        timezone: 'Australia/Melbourne',
        fiscalYearStartMonth: 7,
        splitMode: 'single',
      },
      db,
    ).id;
    createMember(hid, { name: 'A', pinHash: 'x', role: 'owner', activeFrom: '2025-01-01' }, db);
    net = createService(
      hid,
      { typeSlug: 'internet', name: 'Internet', provider: 'Aussie Broadband' },
      db,
    ).id;
  });
  afterAll(() => {
    close();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('archives a file under inbox/YYYY/MM and dedupes by content hash', () => {
    const buf = Buffer.from('hello bill');
    const a = archiveDocument(
      hid,
      {
        kind: 'upload',
        buffer: buf,
        originalFilename: 'bill.txt',
        mimeType: 'text/plain',
        receivedAt: '2026-09-24T00:00:00Z',
      },
      db,
    );
    expect(a.duplicate).toBe(false);
    expect(a.doc.path.startsWith('2026/09/')).toBe(true);
    expect(readDocument(a.doc).toString()).toBe('hello bill');
    const b = archiveDocument(
      hid,
      { kind: 'upload', buffer: buf, originalFilename: 'again.txt', mimeType: 'text/plain' },
      db,
    );
    expect(b.duplicate).toBe(true);
    expect(b.doc.id).toBe(a.doc.id);
  });

  it('routes a confident AI reading to a bill and blocks duplicates', async () => {
    const text = fs.readFileSync(path.join(__dirname, 'fixtures', 'aussie-broadband.txt'), 'utf8');
    const doc = archiveDocument(
      hid,
      {
        kind: 'upload',
        buffer: Buffer.from(text),
        originalFilename: 'invoice.txt',
        mimeType: 'text/plain',
      },
      db,
    ).doc;
    const outcome = await processDocument(hid, doc.id, db);
    expect(outcome.status).toBe('extracted');
    expect(outcome.result?.extractor).toBe('llm:anthropic');
    expect(outcome.result?.bill.amountMinor).toBe(12900);
    expect(outcome.result?.bill.externalRef).toBe('59259831');
    expect(outcome.result?.bill.accountRef).toBe('14809800');
    expect(outcome.result?.bill.issueDate).toBe('2026-06-14');
    expect(getDocument(hid, doc.id, db)?.status).toBe('extracted');
    // Same invoice, different bytes → duplicate detection by invoice number.
    const doc2 = archiveDocument(
      hid,
      {
        kind: 'upload',
        buffer: Buffer.from(text + '\n'),
        originalFilename: 'invoice-copy.txt',
        mimeType: 'text/plain',
      },
      db,
    ).doc;
    const dup = await processDocument(hid, doc2.id, db);
    expect(dup.status).toBe('ignored');
    expect(dup.reason).toBe('duplicate');
  });

  it('sends unreadable documents, and ones the AI can’t read, to review', async () => {
    const empty = archiveDocument(
      hid,
      {
        kind: 'upload',
        buffer: Buffer.from('x'),
        originalFilename: 'blank.txt',
        mimeType: 'text/plain',
      },
      db,
    ).doc;
    expect((await processDocument(hid, empty.id, db)).reason).toBe('no-text');
    const unknown = archiveDocument(
      hid,
      {
        kind: 'upload',
        buffer: Buffer.from(
          'Some Other Energy Co tax invoice. Amount due $200.00 by 1 Oct 2026 for the period 1 Jul 2026 to 30 Sep 2026.',
        ),
        originalFilename: 'other.txt',
        mimeType: 'text/plain',
      },
      db,
    ).doc;
    const o = await processDocument(hid, unknown.id, db);
    expect(o.status).toBe('needs_review');
    expect(o.reason).toBe('no-result');
  });

  it('never accepts a low-confidence result silently', async () => {
    const shaky: Extractor = {
      name: 'test:shaky',
      canHandle: () => true,
      extract: async (input: ExtractionInput) => ({
        extractor: 'test:shaky',
        confidence: 0.5,
        warnings: [],
        bill: {
          provider: 'Aussie Broadband',
          serviceType: 'internet',
          amountMinor: 100,
          currency: 'AUD',
          periodStart: '2026-01-01',
          periodEnd: '2026-01-31',
          dueDate: '2026-02-01',
          serviceId: net,
          externalRef: `x-${input.text.length}`,
        },
      }),
    };
    const { best, attempts } = await runExtractors(
      buildInput(hid, 'any text at all here', {}, db),
      {
        extractors: [shaky],
        threshold: 0.85,
      },
    );
    expect(best?.confidence).toBe(0.5);
    expect(attempts).toHaveLength(1);
  });
});
