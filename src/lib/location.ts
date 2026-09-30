import fs from 'node:fs';
import path from 'node:path';
import { and, eq } from 'drizzle-orm';
import { getDb, type Db } from '@/db/client';
import { household, type Household } from '@/db/schema';
import { resetBillWeather } from '@/lib/weather';

/**
 * Household location, to the postcode and never finer (scope S2).
 *
 * Reference data: one file per country under reference/postcodes (GeoNames,
 * CC BY 4.0; see NOTICE.md), loaded into memory on first use. Australia is
 * the first country with data; elsewhere the country and postcode are kept
 * without a map point until that country's file is added.
 */

export interface PostcodeArea {
  country: string;
  postcode: string;
  stateCode: string;
  state: string;
  region: string;
  latitude: number;
  longitude: number;
  localities: string[];
}

export interface Place {
  postcode: string;
  locality: string;
  stateCode: string;
}

const cache = new Map<string, Map<string, PostcodeArea> | null>();

function referenceDir(): string {
  return path.join(process.cwd(), 'reference', 'postcodes');
}

function load(country: string): Map<string, PostcodeArea> | null {
  const cc = country.toUpperCase();
  if (cache.has(cc)) return cache.get(cc)!;
  const file = path.join(referenceDir(), `${cc}.tsv`);
  if (!/^[A-Z]{2}$/.test(cc) || !fs.existsSync(file)) {
    cache.set(cc, null);
    return null;
  }
  const areas = new Map<string, PostcodeArea>();
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    if (!line || line.startsWith('#')) continue;
    const [postcode, stateCode, state, region, lat, lon, names] = line.split('\t');
    if (!postcode || !lat || !lon) continue;
    areas.set(postcode, {
      country: cc,
      postcode,
      stateCode: stateCode ?? '',
      state: state ?? '',
      region: region ?? '',
      latitude: Number(lat),
      longitude: Number(lon),
      localities: (names ?? '').split('|').filter(Boolean),
    });
  }
  cache.set(cc, areas);
  return areas;
}

/** Countries with a postcode reference file, e.g. ["AU"]. */
export function countriesWithData(): string[] {
  try {
    return fs
      .readdirSync(referenceDir())
      .filter((f) => /^[A-Z]{2}\.tsv$/.test(f))
      .map((f) => f.slice(0, 2))
      .sort();
  } catch {
    return [];
  }
}

/** Countries with postcode reference data. */
export function hasPostcodeData(country: string): boolean {
  return load(country) !== null;
}

/** "en-AU" → "AU". */
export function countryFromLocale(locale: string): string | null {
  const region = locale.split(/[-_]/)[1];
  return region && /^[A-Za-z]{2}$/.test(region) ? region.toUpperCase() : null;
}

/** Tidy a postcode as typed: "  3550 " → "3550", "sw1a 1aa" → "SW1A 1AA". */
function normalisePostcode(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ').toUpperCase();
}

export function lookupPostcode(country: string, postcode: string): PostcodeArea | null {
  return load(country)?.get(normalisePostcode(postcode)) ?? null;
}

/**
 * Places matching what someone typed: a postcode (or its start) or a suburb /
 * town name. Exact postcode first, then names that start with the text, then
 * names that contain it.
 */
export function searchPlaces(country: string, query: string, limit = 10): Place[] {
  const areas = load(country);
  const q = query.trim().toLowerCase();
  if (!areas || q.length < 2) return [];
  const out: Place[] = [];
  const seen = new Set<string>();
  const add = (a: PostcodeArea, locality: string) => {
    const key = `${a.postcode}|${locality}`;
    if (seen.has(key) || out.length >= limit) return;
    seen.add(key);
    out.push({ postcode: a.postcode, locality, stateCode: a.stateCode });
  };
  if (/^\d+$/.test(q)) {
    for (const a of areas.values())
      if (a.postcode.startsWith(q)) for (const l of a.localities) add(a, l);
    return out;
  }
  const starts: [PostcodeArea, string][] = [];
  const contains: [PostcodeArea, string][] = [];
  for (const a of areas.values())
    for (const l of a.localities) {
      const name = l.toLowerCase();
      if (name.startsWith(q)) starts.push([a, l]);
      else if (name.includes(q)) contains.push([a, l]);
    }
  const byName = (x: [PostcodeArea, string], y: [PostcodeArea, string]) =>
    x[1].length - y[1].length || x[1].localeCompare(y[1]);
  for (const [a, l] of [...starts.sort(byName), ...contains.sort(byName)]) add(a, l);
  return out;
}

export class LocationError extends Error {}

/**
 * Save where a household is. With reference data for the country the postcode
 * must exist, and the locality is checked against it (else its first one).
 * Without data, the country and postcode are kept with no map point.
 */
export function setHouseholdLocation(
  householdId: string,
  input: { country: string; postalCode: string; locality?: string | null },
  db: Db = getDb(),
): Household {
  const country = input.country.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(country)) throw new LocationError('Choose a country');
  const postalCode = normalisePostcode(input.postalCode);
  if (!/^[A-Z0-9][A-Z0-9 -]{1,9}$/.test(postalCode)) throw new LocationError('Enter a postcode');
  let fields: Partial<Household>;
  if (hasPostcodeData(country)) {
    const area = lookupPostcode(country, postalCode);
    if (!area)
      throw new LocationError(
        `We don't know postcode ${postalCode}. Try your suburb or town instead.`,
      );
    const locality =
      area.localities.find((l) => l.toLowerCase() === input.locality?.trim().toLowerCase()) ??
      area.localities[0] ??
      null;
    fields = {
      locality,
      region: area.region || area.state,
      latitude: area.latitude,
      longitude: area.longitude,
    };
  } else {
    fields = {
      locality: input.locality?.trim() || null,
      region: null,
      latitude: null,
      longitude: null,
    };
  }
  const now = new Date().toISOString();
  const before = db.select().from(household).where(eq(household.id, householdId)).get();
  db.update(household)
    .set({ country, postalCode, ...fields, locationUpdatedAt: now, updatedAt: now })
    .where(and(eq(household.id, householdId)))
    .run();
  // A new map point means different weather for every bill.
  if (before?.latitude !== fields.latitude || before?.longitude !== fields.longitude)
    resetBillWeather(householdId, db);
  return db.select().from(household).where(eq(household.id, householdId)).get()!;
}

export function clearHouseholdLocation(householdId: string, db: Db = getDb()): void {
  const now = new Date().toISOString();
  db.update(household)
    .set({
      country: null,
      postalCode: null,
      locality: null,
      region: null,
      latitude: null,
      longitude: null,
      locationUpdatedAt: now,
      updatedAt: now,
    })
    .where(eq(household.id, householdId))
    .run();
  resetBillWeather(householdId, db);
}

/** "Bendigo, Victoria 3550" — or just the postcode and country when there's no data. */
export function describeLocation(hh: Household): string | null {
  if (!hh.postalCode || !hh.country) return null;
  const area = lookupPostcode(hh.country, hh.postalCode);
  const place = hh.locality ?? area?.localities[0];
  const state = area?.stateCode;
  return [place, [state, hh.postalCode].filter(Boolean).join(' ')].filter(Boolean).join(', ');
}
