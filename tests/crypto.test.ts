import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { openDb, type Db } from '@/db/client';
import { runMigrations } from '@/db/migrate';
import { archiveDocument, documentPath, readDocument } from '@/ingest/archive';
import { sealExistingFiles } from '@/ingest/seal';
import {
  anyHouseholdKeyed,
  decryptBytes,
  encryptBytes,
  householdKey,
  isEncrypted,
  unwrapKey,
  wrapKey,
} from '@/lib/crypto';
import { resetEnvCache } from '@/lib/env';
import { createHousehold } from '@/lib/households';

let dir: string;
let db: Db;
let close: () => void;
const master = randomBytes(32);

beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hud-crypto-'));
  runMigrations(dir);
  const opened = openDb(dir);
  db = opened.db;
  close = () => opened.sqlite.close();
  process.env.DATA_DIR = dir;
  resetEnvCache();
});

afterAll(() => {
  close();
  fs.rmSync(dir, { recursive: true, force: true });
  delete process.env.DATA_KEY;
  resetEnvCache();
});

const withKey = (on: boolean) => {
  if (on) process.env.DATA_KEY = master.toString('base64');
  else delete process.env.DATA_KEY;
  resetEnvCache();
};

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

describe('encryption at rest (SCOPE-console.md §5b)', () => {
  it('seals bytes with a key and the household as associated data', () => {
    const key = randomBytes(32);
    const sealed = encryptBytes(Buffer.from('a bill'), key, 'h1');
    expect(isEncrypted(sealed)).toBe(true);
    expect(sealed.subarray(0, 4).toString()).toBe('GRN1');
    expect(decryptBytes(sealed, key, 'h1').toString()).toBe('a bill');
    expect(() => decryptBytes(sealed, key, 'h2')).toThrow();
    expect(() => decryptBytes(sealed, randomBytes(32), 'h1')).toThrow();
    expect(isEncrypted(Buffer.from('%PDF-1.4 plain'))).toBe(false);
    const wrapped = wrapKey(key, master);
    expect(wrapped.startsWith('v1.')).toBe(true);
    expect(unwrapKey(wrapped, master).equals(key)).toBe(true);
  });

  it('keeps files plain without DATA_KEY, seals them with it, and still opens older plain files', () => {
    withKey(false);
    const hh = household('Plain House');
    expect(householdKey(hh.id, db)).toBeNull();
    const plain = archiveDocument(
      hh.id,
      {
        kind: 'upload',
        buffer: Buffer.from('plain bill'),
        originalFilename: 'a.txt',
        mimeType: 'text/plain',
      },
      db,
    ).doc;
    expect(fs.readFileSync(documentPath(plain)).toString()).toBe('plain bill');
    expect(anyHouseholdKeyed(db)).toBe(false);

    withKey(true);
    const sealed = archiveDocument(
      hh.id,
      {
        kind: 'upload',
        buffer: Buffer.from('secret bill'),
        originalFilename: 'b.txt',
        mimeType: 'text/plain',
      },
      db,
    ).doc;
    const onDisk = fs.readFileSync(documentPath(sealed));
    expect(isEncrypted(onDisk)).toBe(true);
    expect(onDisk.includes(Buffer.from('secret bill'))).toBe(false);
    expect(readDocument(sealed, db).toString()).toBe('secret bill');
    expect(anyHouseholdKeyed(db)).toBe(true);
    // The older plain file is still read as it is…
    expect(readDocument(plain, db).toString()).toBe('plain bill');
    // …until the startup step seals it.
    expect(sealExistingFiles(db)).toBe(1);
    expect(isEncrypted(fs.readFileSync(documentPath(plain)))).toBe(true);
    expect(readDocument(plain, db).toString()).toBe('plain bill');
    expect(sealExistingFiles(db)).toBe(0);

    // Another household's key never opens it.
    const other = household('Other House');
    expect(() => readDocument({ householdId: other.id, path: sealed.path }, db)).toThrow();

    withKey(false);
    expect(() => readDocument(sealed, db)).toThrow(/DATA_KEY/);
  });
});
