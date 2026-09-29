import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { openDb, type Db } from '@/db/client';
import { runMigrations } from '@/db/migrate';
import { archiveDocument, documentPath, getDocument, setDocumentStatus } from '@/ingest/archive';
import { processDocument } from '@/ingest/pipeline';
import { exportEntries } from '@/lib/export';
import { filedDocuments, monthFolder, refileDocuments, safeSegment } from '@/lib/filing';
import { createHousehold } from '@/lib/households';
import { createMember } from '@/lib/members';
import { createService, updateService } from '@/lib/services';
import { zipBuffer } from '@/lib/zip';
import { blankPdf } from './helpers/blank-pdf';
import { scriptAi, type AiOutput } from './helpers/fake-ai';

let dir: string;
let db: Db;
let close: () => void;

beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hud-export-'));
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

/** Read a zip back: every entry's name and contents (from the central directory). */
function unzip(buf: Buffer): Map<string, Buffer> {
  const end = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  const count = buf.readUInt16LE(end + 10);
  let p = buf.readUInt32LE(end + 16);
  const out = new Map<string, Buffer>();
  for (let i = 0; i < count; i++) {
    expect(buf.readUInt32LE(p)).toBe(0x02014b50);
    const method = buf.readUInt16LE(p + 10);
    const crc = buf.readUInt32LE(p + 16);
    const size = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.subarray(p + 46, p + 46 + nameLen).toString('utf8');
    const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const body = buf.subarray(start, start + size);
    const data = method === 8 ? zlib.inflateRawSync(body) : Buffer.from(body);
    expect(zlib.crc32(data) >>> 0).toBe(crc);
    out.set(name, data);
    p += 46 + nameLen + buf.readUInt16LE(p + 30) + buf.readUInt16LE(p + 32);
  }
  return out;
}

const notice = (provider: string, type: string, issue: string): AiOutput => ({
  document_type: 'bill',
  provider,
  document_date: issue,
  service_type: type,
  bill: {
    amount: 918,
    currency: 'AUD',
    tax_amount: null,
    tax_label: null,
    period_start: '2026-07-01',
    period_end: '2027-06-30',
    issue_date: issue,
    due_date: '2026-09-30',
    usage_quantity: null,
    usage_unit: null,
    invoice_number: `INV-${provider.length}-${issue}`,
    account_number: null,
    auto_pay: false,
    previous_payment: null,
    metrics: [],
    instalments: [
      { due_date: '2026-09-30', amount: 459 },
      { due_date: '2027-02-28', amount: 459 },
    ],
  },
  payment: null,
  confidence: 0.95,
  notes: null,
});

let n = 0;
function setup() {
  const hh = createHousehold(
    {
      name: `Riverside/House ${++n}`,
      currency: 'AUD',
      locale: 'en-AU',
      timezone: 'Australia/Melbourne',
      fiscalYearStartMonth: 7,
      splitMode: 'shared',
    },
    db,
  );
  const jo = createMember(hh.id, { name: 'Jo', role: 'owner', activeFrom: '2025-01-01' }, db);
  const sam = createMember(hh.id, { name: 'Sam', activeFrom: '2025-01-01' }, db);
  const rates = createService(
    hh.id,
    {
      typeSlug: 'council_rates',
      name: 'Council rates',
      provider: 'City of Riverside',
      payerMemberId: jo.id,
    },
    db,
  );
  const upload = async (memberId: string, answer: AiOutput) => {
    scriptAi(answer);
    const doc = archiveDocument(
      hh.id,
      {
        kind: 'upload',
        // A scan, made unique so it isn't taken for the same file again.
        buffer: Buffer.concat([blankPdf(), Buffer.from(`% ${Math.random()}\n`)]),
        originalFilename: 'scan 0042.pdf',
        mimeType: 'application/pdf',
        memberId,
      },
      db,
    ).doc;
    const outcome = await processDocument(hh.id, doc.id, db);
    expect(outcome.status).toBe('extracted');
    return { docId: doc.id, billId: outcome.billId! };
  };
  return { hh, jo, sam, rates, upload };
}

describe('filing names', () => {
  it('are safe everywhere and months sort in order', () => {
    expect(safeSegment('A/B: "C" <D>?*|. ')).toBe('A B C D');
    expect(safeSegment('   ')).toBe('Untitled');
    expect(monthFolder('2026-08', 'en-AU')).toBe('08 August');
  });
});

describe('filing on the NAS', () => {
  it('files a bill by year, month and service, named by date, service and business', async () => {
    const { hh, jo, upload } = setup();
    const { docId } = await upload(
      jo.id,
      notice('City of Riverside', 'council_rates', '2026-08-11'),
    );
    const doc = getDocument(hh.id, docId, db)!;
    expect(doc.path).toBe(
      `households/Riverside House ${n} (${hh.id.slice(-6)})/2026/08 August/Council rates/2026-08-11 Council rates - City of Riverside.pdf`,
    );
    expect(fs.existsSync(documentPath(doc))).toBe(true);
  });

  it('files receipts beside their bill, and moves files when a service is renamed', async () => {
    const { hh, jo, rates, upload } = setup();
    const { billId } = await upload(
      jo.id,
      notice('City of Riverside', 'council_rates', '2026-08-11'),
    );
    const receipt = archiveDocument(
      hh.id,
      {
        kind: 'upload',
        buffer: Buffer.from(`receipt ${Math.random()}`),
        originalFilename: 'r.pdf',
      },
      db,
    ).doc;
    setDocumentStatus(
      hh.id,
      receipt.id,
      'notice',
      JSON.stringify({ code: 'receipt', billId, documentDate: '2026-09-18' }),
      db,
    );
    refileDocuments(hh.id, db);
    expect(getDocument(hh.id, receipt.id, db)!.path).toMatch(
      /\/2026\/09 September\/Council rates\/2026-09-18 Council rates - City of Riverside - receipt\.pdf$/,
    );

    updateService(hh.id, rates.id, { name: 'Rates' }, db);
    expect(refileDocuments(hh.id, db)).toBe(2);
    const paths = filedDocuments(hh.id, {}, db).map((f) => getDocument(hh.id, f.doc.id, db)!.path);
    expect(paths).toHaveLength(2);
    for (const p of paths) {
      expect(p).toContain('/Rates/');
      expect(fs.existsSync(documentPath({ path: p }))).toBe(true);
    }
    // Nothing left to move the second time.
    expect(refileDocuments(hh.id, db)).toBe(0);
  });

  it('marks personal services in their folder name', async () => {
    const { hh, sam, upload } = setup();
    const { docId } = await upload(
      sam.id,
      notice('Example Roads', 'vehicle_registration', '2026-07-20'),
    );
    expect(getDocument(hh.id, docId, db)!.path).toMatch(
      /\/2026\/07 July\/Vehicle registration \(Sam, personal\)\/2026-07-20 Vehicle registration - Example Roads\.pdf$/,
    );
  });

  it('numbers files that would share a name', async () => {
    const { hh, jo, upload } = setup();
    await upload(jo.id, notice('City of Riverside', 'council_rates', '2026-08-11'));
    const second = await upload(jo.id, {
      ...notice('City of Riverside', 'council_rates', '2026-08-11'),
      bill: {
        ...notice('City of Riverside', 'council_rates', '2026-08-11').bill!,
        invoice_number: 'OTHER',
      },
    });
    expect(getDocument(hh.id, second.docId, db)!.path).toMatch(
      /2026-08-11 Council rates - City of Riverside \(2\)\.pdf$/,
    );
  });
});

describe('the export zip', () => {
  it('holds the spreadsheets and every file, filed, and only what the person may see', async () => {
    const { hh, jo, sam, upload } = setup();
    await upload(jo.id, notice('City of Riverside', 'council_rates', '2026-08-11'));
    await upload(jo.id, notice('Jo Roads', 'vehicle_registration', '2026-07-20'));
    await upload(sam.id, notice('Sam Roads', 'vehicle_registration', '2026-07-21'));

    // The admin: the household's bills and their own personal ones.
    const admin = exportEntries(hh.id, { viewer: jo.id }, '2026-09-29', db);
    const files = unzip(await zipBuffer(admin.entries));
    const root = `Riverside House ${n} bills 2026-09-29`;
    expect(admin.folder).toBe(root);
    const names = [...files.keys()].map((k) => k.slice(root.length + 1));
    expect(names).toEqual([
      'README.txt',
      'bills.csv',
      'files.csv',
      'instalments.csv',
      'shares.csv',
      '2026/07 July/Vehicle registration (Jo, personal)/2026-07-20 Vehicle registration - Jo Roads.pdf',
      '2026/08 August/Council rates/2026-08-11 Council rates - City of Riverside.pdf',
    ]);
    expect(
      files
        .get(
          `${root}/2026/08 August/Council rates/2026-08-11 Council rates - City of Riverside.pdf`,
        )!
        .toString(),
    ).toMatch(/^%PDF-1\.4/);
    const bills = files.get(`${root}/bills.csv`)!.toString();
    expect(bills).toContain('Personal (Jo)');
    expect(bills).toContain(
      '2026/08 August/Council rates/2026-08-11 Council rates - City of Riverside.pdf',
    );
    expect(bills).not.toContain('Sam Roads');
    expect(files.get(`${root}/README.txt`)!.toString()).toContain('2 bills and 2 files');

    // A member: only their own personal bills.
    const mine = exportEntries(hh.id, { owner: sam.id }, '2026-09-29', db);
    const theirs = [...unzip(await zipBuffer(mine.entries)).keys()];
    expect(theirs.filter((k) => k.endsWith('.pdf'))).toEqual([
      `${root}/2026/07 July/Vehicle registration (Sam, personal)/2026-07-21 Vehicle registration - Sam Roads.pdf`,
    ]);
    expect(theirs.some((k) => k.includes('Council rates'))).toBe(false);
  });
});
