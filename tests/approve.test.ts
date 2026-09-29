import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { openDb, type Db } from '@/db/client';
import { runMigrations } from '@/db/migrate';
import { approveDocument } from '@/ingest/approve';
import { archiveDocument, getDocument } from '@/ingest/archive';
import { processDocument } from '@/ingest/pipeline';
import { getBill } from '@/lib/bills';
import { createHousehold } from '@/lib/households';
import { createMember } from '@/lib/members';
import { createService } from '@/lib/services';

let dir: string;
let db: Db;
let close: () => void;

beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hud-approve-'));
  runMigrations(dir);
  const opened = openDb(dir);
  db = opened.db;
  close = () => opened.sqlite.close();
});

afterAll(() => {
  close();
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('approving a document from the Inbox', () => {
  it('makes one bill from the checked fields, and never a second', async () => {
    const hh = createHousehold(
      {
        name: 'Approve',
        currency: 'AUD',
        locale: 'en-AU',
        timezone: 'Australia/Melbourne',
        fiscalYearStartMonth: 7,
        splitMode: 'shared',
      },
      db,
    );
    const jo = createMember(hh.id, { name: 'Jo', role: 'owner', activeFrom: '2026-01-01' }, db);
    const water = createService(
      hh.id,
      { typeSlug: 'water', name: 'Water', provider: 'Example Water', payerMemberId: jo.id },
      db,
    );
    // Something the stand-in AI can't read: it waits in the Inbox.
    const doc = archiveDocument(
      hh.id,
      {
        kind: 'upload',
        buffer: Buffer.from('A water bill the reader could not make sense of, at all, really.'),
        originalFilename: 'water.txt',
        mimeType: 'text/plain',
      },
      db,
    ).doc;
    const read = await processDocument(hh.id, doc.id, db);
    expect(read.status).toBe('needs_review');

    const fields = {
      serviceId: water.id,
      amountMinor: 21_050,
      currency: 'AUD',
      periodStart: '2026-07-01',
      periodEnd: '2026-09-30',
      dueDate: '2026-10-21',
    };
    const { billId } = approveDocument(hh.id, doc.id, fields, jo, {}, db);
    const b = getBill(hh.id, billId, db)!;
    expect(b.amountMinor).toBe(21_050);
    expect(b.sourceDocumentId).toBe(doc.id);
    expect(b.createdByMemberId).toBe(jo.id);
    expect(getDocument(hh.id, doc.id, db)?.status).toBe('extracted');
    // Another tab, a double submit, or a re-read: still one bill.
    expect(() => approveDocument(hh.id, doc.id, fields, jo, {}, db)).toThrow(/already/);
    expect((await processDocument(hh.id, doc.id, db)).reason).toBe('already-read');
  });
});
