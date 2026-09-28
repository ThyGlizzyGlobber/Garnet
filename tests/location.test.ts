import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { openDb, type Db } from '@/db/client';
import { runMigrations } from '@/db/migrate';
import { createHousehold, getHousehold } from '@/lib/households';
import {
  clearHouseholdLocation,
  countriesWithData,
  countryFromLocale,
  describeLocation,
  LocationError,
  lookupPostcode,
  searchPlaces,
  setHouseholdLocation,
} from '@/lib/location';
import { householdClimate, nextSeason } from '@/lib/seasons';

let dir: string;
let db: Db;
let close: () => void;

beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hud-location-'));
  runMigrations(dir);
  const opened = openDb(dir);
  db = opened.db;
  close = () => opened.sqlite.close();
});

afterAll(() => {
  close();
  fs.rmSync(dir, { recursive: true, force: true });
});

let n = 0;
const household = (timezone = 'Australia/Melbourne') =>
  createHousehold(
    {
      name: `Location ${++n}`,
      currency: 'AUD',
      locale: 'en-AU',
      timezone,
      fiscalYearStartMonth: 7,
      splitMode: 'shared',
    },
    db,
  );

describe('postcode reference data', () => {
  it('has Australia, with a map point, state, region and suburbs per postcode', () => {
    expect(countriesWithData()).toContain('AU');
    const bendigo = lookupPostcode('AU', ' 3550 ')!;
    expect(bendigo.stateCode).toBe('VIC');
    expect(bendigo.region).toBe('Greater Bendigo');
    expect(bendigo.localities).toContain('Bendigo');
    expect(bendigo.latitude).toBeCloseTo(-36.73, 1);
    expect(bendigo.longitude).toBeCloseTo(144.32, 1);
    expect(lookupPostcode('AU', '9999')).toBeNull();
    expect(lookupPostcode('NZ', '6011')).toBeNull(); // no data for NZ yet
  });

  it('finds places by postcode or suburb name', () => {
    const byName = searchPlaces('AU', 'bendigo');
    expect(byName[0]).toEqual({ postcode: '3550', locality: 'Bendigo', stateCode: 'VIC' });
    expect(byName.every((p) => p.locality.toLowerCase().includes('bendigo'))).toBe(true);
    const byCode = searchPlaces('AU', '355');
    expect(byCode.length).toBeGreaterThan(0);
    expect(byCode.every((p) => p.postcode.startsWith('355'))).toBe(true);
    expect(searchPlaces('AU', 'b')).toEqual([]); // too short
    expect(searchPlaces('NZ', 'wellington')).toEqual([]);
  });

  it('reads the country from the locale', () => {
    expect(countryFromLocale('en-AU')).toBe('AU');
    expect(countryFromLocale('en_GB')).toBe('GB');
    expect(countryFromLocale('en')).toBeNull();
  });
});

describe('a household’s location', () => {
  it('is saved from a known postcode, with the suburb checked against it', () => {
    const hh = household();
    const saved = setHouseholdLocation(
      hh.id,
      { country: 'au', postalCode: '3550', locality: 'kennington' },
      db,
    );
    expect(saved).toMatchObject({
      country: 'AU',
      postalCode: '3550',
      locality: 'Kennington',
      region: 'Greater Bendigo',
    });
    expect(saved.latitude).toBeCloseTo(-36.73, 1);
    expect(describeLocation(saved)).toBe('Kennington, VIC 3550');
    // An unknown suburb falls back to the postcode's first one.
    expect(
      setHouseholdLocation(hh.id, { country: 'AU', postalCode: '3550', locality: 'Nowhere' }, db)
        .locality,
    ).toBe('Bendigo');
  });

  it('refuses an unknown Australian postcode, and keeps others without a map point', () => {
    const hh = household();
    expect(() => setHouseholdLocation(hh.id, { country: 'AU', postalCode: '9999' }, db)).toThrow(
      LocationError,
    );
    const nz = setHouseholdLocation(hh.id, { country: 'NZ', postalCode: '6011' }, db);
    expect(nz).toMatchObject({ country: 'NZ', postalCode: '6011', latitude: null });
    expect(describeLocation(nz)).toBe('6011');
    clearHouseholdLocation(hh.id, db);
    expect(getHousehold(hh.id, db)?.postalCode).toBeNull();
  });
});

describe('seasons from the postcode', () => {
  it('come from the map point once there is one, else the timezone', () => {
    const hh = household('Europe/London'); // a household that never fixed its timezone
    expect(householdClimate(getHousehold(hh.id, db)!)).toEqual({
      hemisphere: 'north',
      climate: 'temperate',
      from: 'timezone',
    });
    setHouseholdLocation(hh.id, { country: 'AU', postalCode: '3550' }, db);
    const withPostcode = householdClimate(getHousehold(hh.id, db)!);
    expect(withPostcode).toEqual({ hemisphere: 'south', climate: 'temperate', from: 'postcode' });
    expect(nextSeason('2026-05-10', withPostcode.hemisphere, withPostcode.climate).season).toBe(
      'winter',
    );
  });

  it('treat the tropics as wet and dry (Darwin, Cairns), not Brisbane', () => {
    const climate = (postcode: string) => {
      const hh = household();
      return householdClimate(
        setHouseholdLocation(hh.id, { country: 'AU', postalCode: postcode }, db),
      ).climate;
    };
    expect(climate('0800')).toBe('tropical'); // Darwin
    expect(climate('4870')).toBe('tropical'); // Cairns
    expect(climate('4000')).toBe('temperate'); // Brisbane
  });
});
