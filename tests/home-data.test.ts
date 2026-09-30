import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { openDb, type Db } from '@/db/client';
import { seedDemo } from '@/db/demo-seed';
import { runMigrations } from '@/db/migrate';
import { homeData } from '@/lib/home-data';
import { listHouseholds } from '@/lib/households';
import { listMembers } from '@/lib/members';

/** The widgets' data, on the fictional demo household. */
let dir: string;
let db: Db;
let close: () => void;

beforeAll(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hud-home-data-'));
  runMigrations(dir);
  const opened = openDb(dir);
  db = opened.db;
  close = () => opened.sqlite.close();
  await seedDemo(db);
});

afterAll(() => {
  close();
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('homeData', () => {
  it('gives every widget its numbers, nothing it can’t send to the browser', () => {
    const hh = listHouseholds(db)[0]!;
    const alex = listMembers(hh.id, db).find((m) => m.name === 'Alex')!;
    const d = homeData(hh, alex, '2026-09-29', db);
    // Serialisable: the client grid gets it as props.
    expect(JSON.parse(JSON.stringify(d))).toEqual(d);
    expect(d.you.name).toBe('Alex');
    expect(d.members.length).toBeGreaterThanOrEqual(2);
    expect(d.split).toBe(true);
    expect(d.fresh).toBe(false);
    expect(d.services.length).toBeGreaterThan(0);
    for (const s of d.services) {
      expect(s.spark).toHaveLength(12);
      expect(s.thisMonthMinor).toBeGreaterThanOrEqual(0);
    }
    expect(d.month.month).toBe('2026-09');
    expect(d.month.day).toBe(29);
    expect(d.month.projectedMinor).toBeGreaterThanOrEqual(d.month.knownMinor);
    expect(d.monthly).toHaveLength(12);
    expect(d.forecast).toHaveLength(6);
    // What Alex pays next is in due-date order, nothing already paid, nothing a month away.
    for (let i = 1; i < d.upcoming.length; i++)
      expect(d.upcoming[i]!.days).toBeGreaterThanOrEqual(d.upcoming[i - 1]!.days);
    for (const u of d.upcoming) expect(u.days).toBeLessThanOrEqual(30);
    expect(d.money).not.toBeNull();
    expect(d.settled).not.toBeNull();
    expect(d.calendar.items.every((x) => x.date >= d.calendar.start)).toBe(true);
    expect(Array.isArray(d.notices)).toBe(true);
    expect(d.start.firstBill).toBe(true);
    // Only Alex's own services under "mine".
    for (const s of d.mine) expect(d.services.map((x) => x.id)).not.toContain(s.id);
  });

  it('keeps a housemate’s own bills out of another’s data', () => {
    const hh = listHouseholds(db)[0]!;
    const members = listMembers(hh.id, db);
    const alex = members.find((m) => m.name === 'Alex')!;
    const jordan = members.find((m) => m.name === 'Jordan')!;
    const a = homeData(hh, alex, '2026-09-29', db);
    const j = homeData(hh, jordan, '2026-09-29', db);
    const aMine = a.mine.map((s) => s.id);
    const jMine = j.mine.map((s) => s.id);
    for (const id of aMine) expect(jMine).not.toContain(id);
    expect(j.upcoming.some((u) => aMine.includes(u.serviceId))).toBe(false);
  });
});
