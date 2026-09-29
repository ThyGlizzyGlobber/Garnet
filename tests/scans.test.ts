import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { openDb, type Db } from '@/db/client';
import { runMigrations } from '@/db/migrate';
import { archiveDocument, getDocument } from '@/ingest/archive';
import { archiveEmail } from '@/ingest/email';
import type { ScanFile } from '@/ingest/extractors/types';
import { processDocument } from '@/ingest/pipeline';
import { createHousehold } from '@/lib/households';
import { createMember } from '@/lib/members';
import { listDocuments } from '@/lib/review';
import { blankPdf } from './helpers/blank-pdf';
import { scriptAi, type AiOutput } from './helpers/fake-ai';

let dir: string;
let db: Db;
let close: () => void;

beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hud-scans-'));
  runMigrations(dir);
  const opened = openDb(dir);
  db = opened.db;
  close = () => opened.sqlite.close();
});

afterAll(() => {
  scriptAi(null);
  close();
  fs.rmSync(dir, { recursive: true, force: true });
});

let n = 0;
function household() {
  const hh = createHousehold(
    {
      name: `Scans ${++n}`,
      currency: 'AUD',
      locale: 'en-AU',
      timezone: 'Australia/Melbourne',
      fiscalYearStartMonth: 7,
      splitMode: 'shared',
    },
    db,
  );
  createMember(hh.id, { name: 'Jo', role: 'owner', activeFrom: '2026-01-01' }, db);
  return hh;
}

const waterBill = (ref: string): AiOutput => ({
  document_type: 'bill',
  provider: 'Yarra Valley Water',
  document_date: null,
  service_type: 'water',
  bill: {
    amount: 182.35,
    currency: 'AUD',
    tax_amount: null,
    tax_label: null,
    period_start: '2026-06-01',
    period_end: '2026-08-31',
    issue_date: null,
    due_date: '2026-09-30',
    usage_quantity: null,
    usage_unit: null,
    invoice_number: ref,
    account_number: null,
    auto_pay: false,
    previous_payment: null,
    metrics: [],
    instalments: null,
  },
  payment: null,
  page_rotation: [],
  confidence: 0.93,
  notes: null,
});

/** Records what the AI was sent, and answers with a water bill. */
function watchAi(ref: string) {
  const seen: { file: ScanFile | null } = { file: null };
  scriptAi((_text, input) => {
    seen.file = input.file ?? null;
    return waterBill(ref);
  });
  return seen;
}

const photo = (width: number, height: number) =>
  sharp({ create: { width, height, channels: 3, background: '#e8e4dc' } })
    .png()
    .toBuffer();

describe('scans and photos', () => {
  it('send a PDF with no text layer to the AI as the file itself', async () => {
    const hh = household();
    const seen = watchAi('W-1');
    const { doc } = archiveDocument(
      hh.id,
      {
        kind: 'upload',
        buffer: blankPdf(),
        originalFilename: 'scan.pdf',
        mimeType: 'application/pdf',
      },
      db,
    );
    const outcome = await processDocument(hh.id, doc.id, db);
    expect(outcome.status).toBe('extracted');
    expect(seen.file?.mediaType).toBe('application/pdf');
    expect(seen.file?.data.subarray(0, 5).toString()).toBe('%PDF-');
  });

  it('shrink and straighten a phone photo to a JPEG before sending it', async () => {
    const hh = household();
    const seen = watchAi('W-2');
    const big = await photo(4032, 3024);
    const { doc } = archiveDocument(
      hh.id,
      { kind: 'upload', buffer: big, originalFilename: 'IMG_0412.png', mimeType: 'image/png' },
      db,
    );
    expect(doc.path.endsWith('.png')).toBe(true);
    expect((await processDocument(hh.id, doc.id, db)).status).toBe('extracted');
    expect(seen.file?.mediaType).toBe('image/jpeg');
    const meta = await sharp(seen.file!.data).metadata();
    expect(Math.max(meta.width!, meta.height!)).toBe(1568);
  });

  it('never send text documents as files', async () => {
    const hh = household();
    const seen = watchAi('W-3');
    const { doc } = archiveDocument(
      hh.id,
      {
        kind: 'upload',
        buffer: Buffer.from('Yarra Valley Water bill. Amount due $182.35 by 30 September 2026.'),
        originalFilename: 'bill.txt',
        mimeType: 'text/plain',
      },
      db,
    );
    await processDocument(hh.id, doc.id, db);
    expect(seen.file).toBeNull();
  });

  it('say so when an iPhone HEIC photo can’t be prepared', async () => {
    const hh = household();
    watchAi('W-4');
    const { doc } = archiveDocument(
      hh.id,
      {
        kind: 'upload',
        buffer: Buffer.from('not really a heic file, but the app cannot tell'),
        originalFilename: 'IMG_0413.HEIC',
        mimeType: 'image/heic',
      },
      db,
    );
    expect((await processDocument(hh.id, doc.id, db)).status).toBe('needs_review');
    const reason = JSON.parse(getDocument(hh.id, doc.id, db)!.extractionJson!).reason as string;
    expect(reason).toMatch(/HEIC/);
  });
});

describe('forwarded photos', () => {
  const mail = (attachment: { type: string; name: string; data: Buffer; related?: boolean }) =>
    Buffer.from(
      [
        'From: Jo <jo@example.com>',
        'To: bills@example.com',
        'Subject: Fwd: water bill',
        'MIME-Version: 1.0',
        `Content-Type: multipart/${attachment.related ? 'related' : 'mixed'}; boundary="b"`,
        '',
        '--b',
        'Content-Type: text/html; charset=utf-8',
        '',
        `<p>Here's the water bill.</p>${attachment.related ? '<img src="cid:logo1">' : ''}`,
        '--b',
        `Content-Type: ${attachment.type}; name="${attachment.name}"`,
        'Content-Transfer-Encoding: base64',
        attachment.related
          ? 'Content-ID: <logo1>\r\nContent-Disposition: inline'
          : `Content-Disposition: attachment; filename="${attachment.name}"`,
        '',
        attachment.data.toString('base64'),
        '--b--',
        '',
      ].join('\r\n'),
    );

  it('keep only the photo of a paper bill, like a PDF', async () => {
    const hh = household();
    const jpg = await sharp(await photo(1200, 1600))
      .jpeg({ quality: 95 })
      .toBuffer();
    // Noise so the file is photo-sized (flat colour compresses to almost nothing).
    const padded = Buffer.concat([jpg, Buffer.alloc(40 * 1024, 7)]);
    const res = await archiveEmail(
      hh.id,
      mail({ type: 'image/jpeg', name: 'bill.jpg', data: padded }),
      '2026-09-28T00:00:00Z',
      db,
    );
    expect(res.archived).toBe(1);
    const docs = listDocuments(hh.id, {}, db);
    expect(docs.map((d) => [d.kind, d.originalFilename, d.mimeType])).toEqual([
      ['pdf', 'bill.jpg', 'image/jpeg'],
    ]);
  });

  it('keep the email when its only picture is an embedded logo', async () => {
    const hh = household();
    const logo = await sharp(await photo(80, 40))
      .png()
      .toBuffer();
    await archiveEmail(
      hh.id,
      mail({ type: 'image/png', name: 'logo.png', data: logo, related: true }),
      '2026-09-28T00:00:00Z',
      db,
    );
    expect(listDocuments(hh.id, {}, db).map((d) => d.kind)).toEqual(['email']);
  });
});
