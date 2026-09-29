import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PDFDocument } from 'pdf-lib';
import sharp from 'sharp';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { openDb, type Db } from '@/db/client';
import { runMigrations } from '@/db/migrate';
import { archiveDocument, documentPath, getDocument, setDocumentStatus } from '@/ingest/archive';
import { processDocument } from '@/ingest/pipeline';
import { originalPath, rotateDocument } from '@/ingest/rotate';
import { createHousehold } from '@/lib/households';
import { createMember } from '@/lib/members';
import { listDocuments, plainReason } from '@/lib/review';
import { createService } from '@/lib/services';
import { blankPdf } from './helpers/blank-pdf';
import { scriptAi, type AiOutput } from './helpers/fake-ai';

let dir: string;
let db: Db;
let close: () => void;

beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hud-rotate-'));
  runMigrations(dir);
  const opened = openDb(dir);
  db = opened.db;
  close = () => opened.sqlite.close();
});

afterAll(() => {
  close();
  fs.rmSync(dir, { recursive: true, force: true });
});

afterEach(() => scriptAi(null));

let n = 0;
function setup() {
  const hh = createHousehold(
    {
      name: `Rotate ${++n}`,
      currency: 'AUD',
      locale: 'en-AU',
      timezone: 'Australia/Melbourne',
      fiscalYearStartMonth: 7,
      splitMode: 'shared',
    },
    db,
  );
  const jo = createMember(hh.id, { name: 'Jo', role: 'owner', activeFrom: '2025-01-01' }, db);
  createService(
    hh.id,
    {
      typeSlug: 'council_rates',
      name: 'Council rates',
      provider: 'City of Riverside',
      payerMemberId: jo.id,
    },
    db,
  );
  const store = (buffer: Buffer, name: string, mimeType: string) =>
    archiveDocument(
      hh.id,
      { kind: 'upload', buffer, originalFilename: name, mimeType, memberId: jo.id },
      db,
    ).doc;
  return { hh, jo, store };
}

const unique = (b: Buffer) => Buffer.concat([b, Buffer.from(`% ${Math.random()}\n`)]);

async function twoPagePdf(): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  pdf.addPage([595, 842]);
  pdf.addPage([595, 842]);
  return Buffer.from(await pdf.save());
}

async function rotations(file: string): Promise<number[]> {
  const pdf = await PDFDocument.load(fs.readFileSync(file));
  return pdf.getPages().map((p) => p.getRotation().angle);
}

describe('turning a stored document', () => {
  it('turns every page of a PDF, keeps the original once, and still knows the file', async () => {
    const { hh, store } = setup();
    const bytes = unique(blankPdf());
    const doc = store(bytes, 'scan.pdf', 'application/pdf');
    expect(await rotateDocument(hh.id, doc.id, 90, db)).toBe(true);
    expect(await rotations(documentPath(doc))).toEqual([90]);
    expect(fs.readFileSync(originalPath(doc)).equals(bytes)).toBe(true);
    // A second turn adds up; the original stays the file as it arrived.
    await rotateDocument(hh.id, doc.id, 90, db);
    expect(await rotations(documentPath(doc))).toEqual([180]);
    expect(fs.readFileSync(originalPath(doc)).equals(bytes)).toBe(true);
    // The same file sent again is still recognised (the hash is the original's).
    expect(archiveDocument(hh.id, { kind: 'upload', buffer: bytes }, db).duplicate).toBe(true);
  });

  it('turns only the pages that need it', async () => {
    const { hh, store } = setup();
    const doc = store(unique(await twoPagePdf()), 'two.pdf', 'application/pdf');
    await rotateDocument(hh.id, doc.id, [{ page: 2, degrees: 270 }], db);
    expect(await rotations(documentPath(doc))).toEqual([0, 270]);
  });

  it('turns a photo', async () => {
    const { hh, store } = setup();
    const png = await sharp({
      create: {
        width: 40,
        height: 20,
        channels: 3,
        background: { r: Math.random() * 255, g: 0, b: 0 },
      },
    })
      .png()
      .toBuffer();
    const doc = store(png, 'bill.png', 'image/png');
    await rotateDocument(hh.id, doc.id, 90, db);
    const meta = await sharp(fs.readFileSync(documentPath(doc))).metadata();
    expect([meta.width, meta.height]).toEqual([20, 40]);
  });

  it('turns a sideways scan the right way up when the AI says so', async () => {
    const { hh, store } = setup();
    const answer: AiOutput = {
      document_type: 'bill',
      provider: 'City of Riverside',
      document_date: '2026-08-11',
      service_type: 'council_rates',
      bill: {
        amount: 918,
        currency: 'AUD',
        tax_amount: null,
        tax_label: null,
        period_start: '2026-07-01',
        period_end: '2027-06-30',
        issue_date: '2026-08-11',
        due_date: '2026-09-30',
        usage_quantity: null,
        usage_unit: null,
        invoice_number: null,
        account_number: null,
        auto_pay: false,
        previous_payment: null,
        metrics: [],
        instalments: null,
      },
      payment: null,
      page_rotation: [
        { page: 1, degrees: 90 },
        { page: 2, degrees: 45 }, // not a quarter turn: ignored
      ],
      confidence: 0.95,
      notes: null,
    };
    scriptAi(answer);
    const doc = store(unique(blankPdf()), 'scan 0042.pdf', 'application/pdf');
    const outcome = await processDocument(hh.id, doc.id, db);
    expect(outcome.status).toBe('extracted');
    expect(await rotations(documentPath(getDocument(hh.id, doc.id, db)!))).toEqual([90]);
  });
});

describe('the inbox', () => {
  it('links a receipt to the bill it paid, so it opens that bill', () => {
    const { hh, store } = setup();
    const receipt = store(Buffer.from(`receipt ${Math.random()}`), 'r.txt', 'text/plain');
    setDocumentStatus(
      hh.id,
      receipt.id,
      'notice',
      JSON.stringify({ code: 'receipt', billId: 'gone' }),
      db,
    );
    // The bill is gone: it stays its own page.
    expect(listDocuments(hh.id, {}, db).find((d) => d.id === receipt.id)?.linkedBillId).toBeNull();
  });

  it('says what happened in plain words, never how the reader works', () => {
    expect(plainReason({ code: 'created', reason: 'Created bill via llm:anthropic' })).toEqual({
      kind: 'none',
    });
    expect(
      plainReason({ code: 'low-confidence', reason: 'Confidence 60% is below the 85% threshold' }),
    ).toEqual({ kind: 'check' });
    expect(plainReason({ reason: 'No readable text in this file' })).toEqual({
      kind: 'text',
      text: 'No readable text in this file',
    });
  });
});
