import fs from 'node:fs';
import path from 'node:path';
import { and, eq } from 'drizzle-orm';
import { getDb, type Db } from '@/db/client';
import { bill, member, service, sourceDocument, type SourceDocument } from '@/db/schema';
import { billDate } from '@/lib/bill-month';
import { getHousehold } from '@/lib/households';
import { dataPaths } from '@/lib/paths';
import { inScope, type Scope } from '@/lib/scope';

/**
 * How bill files are filed, the same way on the NAS and in an export:
 *
 *   2026/08 August/Council rates/2026-08-11 Council rates - City of Greater Bendigo.pdf
 *   2026/09 September/Council rates/2026-09-18 Council rates - City of Greater Bendigo - receipt.pdf
 *   2026/08 August/Car rego (Alex, personal)/2026-07-20 Car rego - Example Roads.pdf
 *
 * Year, then month (numbered so it sorts), then service; each file named by its
 * date, service and business. A bill is filed under the month it belongs to
 * (see billDate: the Bills page's month); its receipts and payment notices sit
 * beside it, named by their own date. On the NAS the tree lives under
 * inbox/households/<household>/. Names are safe on Windows, macOS and Linux.
 */

export type FiledKind = 'bill' | 'receipt' | 'notice';

export interface FiledDocument {
  doc: SourceDocument;
  kind: FiledKind;
  billId: string;
  ownerMemberId: string | null;
  /** Folder path relative to the tree's root, e.g. "2026/08 August/Council rates". */
  folder: string;
  /** File name without a number for duplicates, e.g. "2026-08-11 Council rates - Agl.pdf". */
  name: string;
}

/** A file or folder name that works everywhere: no reserved characters, no trailing dots. */
export function safeSegment(s: string, max = 80): string {
  const out = [...s]
    .map((c) => (c.charCodeAt(0) < 32 ? ' ' : c))
    .join('')
    .replace(/[<>:"/\\|?*]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[. ]+$/, '')
    .slice(0, max)
    .trim();
  return out || 'Untitled';
}

/** "08 August" for a YYYY-MM month: numbered so folders sort in calendar order. */
export function monthFolder(month: string, locale: string): string {
  const name = new Intl.DateTimeFormat(locale, { month: 'long', timeZone: 'UTC' }).format(
    new Date(`${month}-01T00:00:00Z`),
  );
  return `${month.slice(5, 7)} ${name}`;
}

const KIND_SUFFIX: Record<FiledKind, string> = {
  bill: '',
  receipt: ' - receipt',
  notice: ' - payment notice',
};

function extensionOf(doc: Pick<SourceDocument, 'path' | 'originalFilename'>): string {
  const ext = path.extname(doc.path) || path.extname(doc.originalFilename ?? '');
  return /^\.[a-z0-9]{1,5}$/i.test(ext) ? ext.toLowerCase() : '';
}

function extraction(doc: SourceDocument): {
  billId?: string;
  code?: string;
  documentDate?: string;
} {
  try {
    return doc.extractionJson ? JSON.parse(doc.extractionJson) : {};
  } catch {
    return {};
  }
}

/**
 * Every document that belongs to a bill, with where it's filed: the file a
 * bill was read from, receipts that paid it and payment notices about it.
 * Documents that aren't about a bill (still waiting, "other" emails) aren't
 * filed. Only bills in the scope (household, a member's own…) are included.
 */
export function filedDocuments(
  householdId: string,
  scope: Scope = { everyone: true },
  db: Db = getDb(),
): FiledDocument[] {
  const hh = getHousehold(householdId, db);
  if (!hh) return [];
  const bills = db
    .select({ b: bill, svc: service, owner: member.name })
    .from(bill)
    .innerJoin(service, eq(bill.serviceId, service.id))
    .leftJoin(member, eq(bill.ownerMemberId, member.id))
    .where(eq(bill.householdId, householdId))
    .all()
    .filter((r) => inScope(r.b.ownerMemberId, scope));
  const byId = new Map(bills.map((r) => [r.b.id, r]));
  const docs = db
    .select()
    .from(sourceDocument)
    .where(eq(sourceDocument.householdId, householdId))
    .all();
  const out: FiledDocument[] = [];
  for (const doc of docs) {
    const x = extraction(doc);
    const asSource = bills.find((r) => r.b.sourceDocumentId === doc.id);
    const asAlert = asSource ? undefined : bills.find((r) => r.b.alertDocumentId === doc.id);
    const viaNotice = asSource || asAlert || !x.billId ? undefined : byId.get(x.billId);
    const row = asSource ?? asAlert ?? viaNotice;
    if (!row) continue;
    const kind: FiledKind = asSource ? 'bill' : x.code === 'receipt' ? 'receipt' : 'notice';
    // A bill is filed under its own date; a receipt or notice under the date on it.
    const date =
      kind === 'bill' ? billDate(row.b) : (x.documentDate ?? doc.receivedAt.slice(0, 10));
    const serviceName = row.b.ownerMemberId
      ? `${row.svc.name} (${row.owner ?? 'personal'}, personal)`
      : row.svc.name;
    out.push({
      doc,
      kind,
      billId: row.b.id,
      ownerMemberId: row.b.ownerMemberId,
      folder: [
        date.slice(0, 4),
        monthFolder(date.slice(0, 7), hh.locale),
        safeSegment(serviceName),
      ].join('/'),
      name: `${safeSegment(`${date} ${row.svc.name} - ${row.svc.provider}${KIND_SUFFIX[kind]}`, 120)}${extensionOf(doc)}`,
    });
  }
  // Same name: the older document keeps the plain name, so " (2)" never moves around.
  return out.sort(
    (a, b) =>
      `${a.folder}/${a.name}`.localeCompare(`${b.folder}/${b.name}`) ||
      a.doc.id.localeCompare(b.doc.id),
  );
}

/**
 * Give each document a unique path under its folder: the second file with the
 * same name gets " (2)", and so on. Keeps an existing unique path where it is.
 */
export function uniquePaths(files: FiledDocument[]): Map<string, string> {
  const taken = new Set<string>();
  const out = new Map<string, string>();
  for (const f of files) {
    const ext = path.extname(f.name);
    const stem = f.name.slice(0, f.name.length - ext.length);
    let candidate = `${f.folder}/${f.name}`;
    for (let n = 2; taken.has(candidate.toLowerCase()); n++)
      candidate = `${f.folder}/${stem} (${n})${ext}`;
    taken.add(candidate.toLowerCase());
    out.set(f.doc.id, candidate);
  }
  return out;
}

/** The household's folder on the NAS: its name, plus its id so two "Smith Household"s never share one. */
export function householdFolder(h: { id: string; name: string }): string {
  return `households/${safeSegment(h.name, 60)} (${h.id.slice(-6)})`;
}

/**
 * File every bill document on the NAS where filedDocuments() says it belongs,
 * moving any that aren't there yet (new bills, a renamed service, a bill moved
 * to another month or service). Files are only ever moved, never rewritten;
 * a move that fails leaves the file and its record as they were. Returns how
 * many were moved.
 */
export function refileDocuments(householdId: string, db: Db = getDb()): number {
  const hh = getHousehold(householdId, db);
  if (!hh) return 0;
  const root = dataPaths().inbox;
  const base = householdFolder(hh);
  const files = filedDocuments(householdId, { everyone: true }, db);
  const targets = uniquePaths(files);
  let moved = 0;
  for (const f of files) {
    const target = `${base}/${targets.get(f.doc.id)!}`;
    if (f.doc.path === target) continue;
    const from = path.join(root, f.doc.path);
    const to = path.join(root, target);
    try {
      if (!fs.existsSync(from)) continue;
      // Another file already there (not ours): leave this one alone rather than overwrite.
      if (fs.existsSync(to)) continue;
      fs.mkdirSync(path.dirname(to), { recursive: true });
      fs.renameSync(from, to);
      try {
        db.update(sourceDocument)
          .set({ path: target })
          .where(and(eq(sourceDocument.householdId, householdId), eq(sourceDocument.id, f.doc.id)))
          .run();
      } catch (e) {
        fs.renameSync(to, from);
        throw e;
      }
      moved++;
      removeEmptyFolders(path.dirname(from), root);
    } catch (e) {
      console.error(`[filing] couldn't file ${f.doc.path}:`, (e as Error).message);
    }
  }
  return moved;
}

/** File every household's documents (at startup and on the worker's tick). */
export function refileAll(db: Db = getDb()): number {
  const ids = db.selectDistinct({ id: sourceDocument.householdId }).from(sourceDocument).all();
  return ids.reduce((n, r) => n + refileDocuments(r.id, db), 0);
}

/** Tidy folders a move left empty, up to (not including) the inbox itself. */
function removeEmptyFolders(dir: string, root: string): void {
  let d = dir;
  while (d.startsWith(root) && d !== root) {
    try {
      if (fs.readdirSync(d).length) return;
      fs.rmdirSync(d);
    } catch {
      return;
    }
    d = path.dirname(d);
  }
}
