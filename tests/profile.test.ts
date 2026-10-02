import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { openDb, type Db } from '@/db/client';
import { runMigrations } from '@/db/migrate';
import { getAccount, linkMember, membershipsFor, signInAccount } from '@/lib/accounts';
import { createHousehold } from '@/lib/households';
import { createMember } from '@/lib/members';
import {
  avatarFile,
  avatarUrl,
  maySeePhoto,
  removePhoto,
  renameEverywhere,
  savePhoto,
} from '@/lib/profile';

/** A person's profile across households (owner, 2026-10-02): one name, one photo. */
let dir: string;
let db: Db;
let close: () => void;

beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hud-profile-'));
  runMigrations(dir);
  const opened = openDb(dir);
  db = opened.db;
  close = () => opened.sqlite.close();
});

afterAll(() => {
  close();
  fs.rmSync(dir, { recursive: true, force: true });
});

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

function setup() {
  const kim = signInAccount({ email: `kim${Math.random()}@example.com`, name: 'Kim' }, db);
  const lee = signInAccount({ email: `lee${Math.random()}@example.com`, name: 'Lee' }, db);
  const stranger = signInAccount({ email: `x${Math.random()}@example.com`, name: 'X' }, db);
  const home = household('Home');
  const parents = household('Parents');
  const join = (hh: { id: string }, a: { id: string; email: string }, name: string) => {
    const m = createMember(hh.id, { name, activeFrom: '2026-01-01' }, db);
    linkMember(m.id, a.id, a.email, db);
  };
  join(home, kim, 'Kim');
  join(parents, kim, 'Kimberley');
  join(home, lee, 'Lee');
  // Someone at the parents' already goes by "Kim B".
  createMember(parents.id, { name: 'Kim B', activeFrom: '2026-01-01' }, db);
  return { kim, lee, stranger };
}

describe('renameEverywhere', () => {
  it('changes the name on the account and in every household, keeping a clash', () => {
    const { kim } = setup();
    expect(renameEverywhere(kim.id, 'Kim B', db)).toEqual({ kept: ['Parents'] });
    expect(getAccount(kim.id, db)!.name).toBe('Kim B');
    expect(membershipsFor(kim.id, db).map((m) => m.name)).toEqual(['Kim B', 'Kimberley']);
    expect(renameEverywhere(kim.id, 'Kimmy', db)).toEqual({ kept: [] });
    expect(membershipsFor(kim.id, db).map((m) => m.name)).toEqual(['Kimmy', 'Kimmy']);
  });
});

describe('profile photos', () => {
  it('are kept as a 512 px square, shown to housemates only, and can be removed', async () => {
    const { kim, lee, stranger } = setup();
    const png = await sharp({
      create: { width: 900, height: 600, channels: 3, background: '#a8141f' },
    })
      .png()
      .toBuffer();
    expect(await savePhoto(kim.id, Buffer.from('not a picture'), db)).toEqual({
      ok: false,
      reason: 'unreadable',
    });
    expect(await savePhoto(kim.id, png, db)).toEqual({ ok: true });
    const meta = await sharp(fs.readFileSync(avatarFile(kim.id))).metadata();
    expect([meta.format, meta.width, meta.height]).toEqual(['jpeg', 512, 512]);
    expect(avatarUrl(getAccount(kim.id, db))).toMatch(new RegExp(`^/api/avatar/${kim.id}\\?v=`));

    // A new photo replaces the last: one file per person.
    const first = getAccount(kim.id, db)!.avatarAt;
    expect(await savePhoto(kim.id, png, db)).toEqual({ ok: true });
    expect(getAccount(kim.id, db)!.avatarAt).not.toBe(first);
    expect(
      fs.readdirSync(path.dirname(avatarFile(kim.id))).filter((f) => f.startsWith(kim.id)),
    ).toEqual([`${kim.id}.jpg`]);

    expect(maySeePhoto(kim.id, kim.id, db)).toBe(true);
    expect(maySeePhoto(lee.id, kim.id, db)).toBe(true);
    expect(maySeePhoto(stranger.id, kim.id, db)).toBe(false);

    removePhoto(kim.id, db);
    expect(fs.existsSync(avatarFile(kim.id))).toBe(false);
    expect(avatarUrl(getAccount(kim.id, db))).toBeNull();
  });
});
