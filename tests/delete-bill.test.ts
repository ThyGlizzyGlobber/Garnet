import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { openDb, type Db } from '@/db/client';
import { runMigrations } from '@/db/migrate';
import {
  archiveDocument,
  deleteBillWithDocument,
  documentPath,
  getDocument,
  purgeOrphanedBillDocuments,
  setDocumentStatus,
} from '@/ingest/archive';
import { processDocument } from '@/ingest/pipeline';
import { getBill, listBills, setBillAlert } from '@/lib/bills';
import { createHousehold } from '@/lib/households';
import { createMember } from '@/lib/members';
import { listDocuments } from '@/lib/review';
import { createService } from '@/lib/services';

let dir: string;
let db: Db;
let close: () => void;

beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hud-delete-'));
  runMigrations(dir);
  const opened = openDb(dir);
  db = opened.db;
  close = () => opened.sqlite.close();
});

afterAll(() => {
  close();
  fs.rmSync(dir, { recursive: true, force: true });
});

const INVOICE = fs.readFileSync(
  path.join(process.cwd(), 'tests/fixtures/aussie-broadband.txt'),
  'utf8',
);

let n = 0;
function setup() {
  const hh = createHousehold(
    {
      name: `Delete ${++n}`,
      currency: 'AUD',
      locale: 'en-AU',
      timezone: 'Australia/Melbourne',
      fiscalYearStartMonth: 7,
      splitMode: 'shared',
    },
    db,
  );
  const jo = createMember(hh.id, { name: 'Jo', role: 'owner', activeFrom: '2026-01-01' }, db);
  createService(
    hh.id,
    { typeSlug: 'internet', name: 'Internet', provider: 'Aussie Broadband', payerMemberId: jo.id },
    db,
  );
  return hh;
}

const upload = (hid: string, text = INVOICE) =>
  archiveDocument(
    hid,
    {
      kind: 'upload',
      buffer: Buffer.from(text),
      originalFilename: 'invoice.txt',
      mimeType: 'text/plain',
    },
    db,
  ).doc;

describe('deleting a bill', () => {
  it('removes the bill and the document it came from, file and all', async () => {
    const hh = setup();
    const doc = upload(hh.id);
    const { billId } = await processDocument(hh.id, doc.id, db);
    // Filed by year, month and service once it became a bill.
    const file = documentPath(getDocument(hh.id, doc.id, db)!);
    expect(fs.existsSync(file)).toBe(true);

    deleteBillWithDocument(hh.id, billId!, db);
    expect(getBill(hh.id, billId!, db)).toBeNull();
    expect(getDocument(hh.id, doc.id, db)).toBeNull();
    expect(fs.existsSync(file)).toBe(false);
    expect(listDocuments(hh.id, {}, db)).toHaveLength(0);

    // Forwarding the same file again reads it afresh instead of calling it a duplicate.
    const again = upload(hh.id);
    expect(again.id).not.toBe(doc.id);
    expect((await processDocument(hh.id, again.id, db)).status).toBe('extracted');
    expect(listBills(hh.id, {}, db)).toHaveLength(1);
  });

  it('keeps a document another bill still uses (a payment notice that flagged it)', async () => {
    const hh = setup();
    const invoice = upload(hh.id);
    const { billId } = await processDocument(hh.id, invoice.id, db);
    const other = upload(hh.id, `${INVOICE}\n`.replaceAll('59259831', '59259832'));
    const second = await processDocument(hh.id, other.id, db);
    setBillAlert(hh.id, second.billId!, 'payment_failed', invoice.id, db);
    deleteBillWithDocument(hh.id, billId!, db);
    expect(getDocument(hh.id, invoice.id, db)).not.toBeNull();
  });

  it('cleans up documents left behind by bills deleted before this fix', () => {
    const hh = setup();
    const orphan = upload(
      hh.id,
      'An invoice whose bill was deleted the old way, long enough to read.',
    );
    setDocumentStatus(hh.id, orphan.id, 'extracted', null, db);
    const waiting = upload(hh.id, 'A bill still waiting for review, with enough text to be read.');
    setDocumentStatus(hh.id, waiting.id, 'needs_review', null, db);
    expect(purgeOrphanedBillDocuments(db)).toBe(1);
    expect(getDocument(hh.id, orphan.id, db)).toBeNull();
    expect(getDocument(hh.id, waiting.id, db)).not.toBeNull();
    expect(purgeOrphanedBillDocuments(db)).toBe(0);
  });
});
