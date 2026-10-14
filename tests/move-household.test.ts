import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { openDb, type Db } from '@/db/client';
import { runMigrations } from '@/db/migrate';
import { archiveDocument, documentPath, getDocument, readDocument } from '@/ingest/archive';
import { moveDocumentToHousehold, moveTargets } from '@/ingest/move-household';
import { processDocument } from '@/ingest/pipeline';
import { signInAccount } from '@/lib/accounts';
import { listBills, setBillAlert } from '@/lib/bills';
import { createHousehold } from '@/lib/households';
import { createMember } from '@/lib/members';
import { createService } from '@/lib/services';

let dir: string;
let db: Db;
let close: () => void;

beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hud-move-hh-'));
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
  const account = signInAccount({ email: `move-${++n}@example.com`, name: 'Jo' }, db);
  const make = (name: string) => {
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
    const me = createMember(
      hh.id,
      { name: 'Jo', role: 'owner', activeFrom: '2026-01-01', accountId: account.id },
      db,
    );
    createService(
      hh.id,
      {
        typeSlug: 'internet',
        name: 'Internet',
        provider: 'Aussie Broadband',
        payerMemberId: me.id,
      },
      db,
    );
    return { hh, me };
  };
  return { here: make(`Here ${n}`), there: make(`There ${n}`) };
}

const upload = (hid: string, memberId: string, text = INVOICE) =>
  archiveDocument(
    hid,
    {
      kind: 'upload',
      buffer: Buffer.from(text),
      originalFilename: 'invoice.txt',
      mimeType: 'text/plain',
      memberId,
    },
    db,
  ).doc;

describe('moving a bill to another household', () => {
  it('offers only the other households of the same account', () => {
    const { here, there } = setup();
    const stranger = createHousehold(
      {
        name: 'Not mine',
        currency: 'AUD',
        locale: 'en-AU',
        timezone: 'Australia/Melbourne',
        fiscalYearStartMonth: 7,
        splitMode: 'shared',
      },
      db,
    );
    createMember(stranger.id, { name: 'Other', activeFrom: '2026-01-01' }, db);
    expect(moveTargets(here.me, db).map((t) => t.member.id)).toEqual([there.me.id]);
  });

  it('takes the bill and its file out of this household and reads it in the other', async () => {
    const { here, there } = setup();
    const doc = upload(here.hh.id, here.me.id);
    const first = await processDocument(here.hh.id, doc.id, db);
    expect(first.billId).toBeTruthy();

    const moved = moveDocumentToHousehold(here.hh.id, doc.id, there.me, db);
    expect(moved.ok).toBe(true);
    if (!moved.ok) return;

    expect(listBills(here.hh.id, {}, db)).toHaveLength(0);
    expect(getDocument(here.hh.id, doc.id, db)).toBeNull();
    expect(fs.existsSync(documentPath(doc))).toBe(false);

    expect(moved.doc.householdId).toBe(there.hh.id);
    expect(moved.doc.memberId).toBe(there.me.id);
    expect(readDocument(moved.doc, db).toString()).toBe(INVOICE);
    const again = await processDocument(there.hh.id, moved.doc.id, db);
    expect(again.status).toBe('extracted');
    expect(listBills(there.hh.id, {}, db)).toHaveLength(1);
  });

  it('keeps a receipt or notice with the bill it updated', async () => {
    const { here, there } = setup();
    const doc = upload(here.hh.id, here.me.id);
    const { billId } = await processDocument(here.hh.id, doc.id, db);
    const notice = upload(here.hh.id, here.me.id, 'Payment received, thank you.');
    setBillAlert(here.hh.id, billId!, 'payment_failed', notice.id, db);

    expect(moveDocumentToHousehold(here.hh.id, notice.id, there.me, db)).toEqual({
      ok: false,
      reason: 'notice',
    });
    expect(getDocument(here.hh.id, notice.id, db)).not.toBeNull();
  });
});
