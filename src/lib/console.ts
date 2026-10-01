import fs from 'node:fs';
import path from 'node:path';
import { and, count, desc, eq, gte, isNotNull, isNull, sql, sum } from 'drizzle-orm';
import { getDb, type Db } from '@/db/client';
import {
  account,
  bill,
  device,
  household,
  member,
  sourceDocument,
  type Household,
} from '@/db/schema';
import { earlyAccessOn, listAllowed, listRequests } from '@/lib/access';
import { developerEmails, getEnv } from '@/lib/env';
import { listAccounts } from '@/lib/accounts';
import { dataPaths } from '@/lib/paths';
import { usageCount } from '@/lib/usage';

/**
 * The console's numbers (SCOPE-console.md §3, C-D6): the install as counts,
 * totals, names and dates. This file never imports the bill, document or
 * money readers, so nothing here can show a provider, an amount from a bill
 * or a document; tests/console.test.ts checks the import list. Health comes
 * from statusView (src/lib/status.ts), which is counts too.
 */
export interface HouseholdRow {
  id: string;
  name: string;
  type: Household['type'];
  isDemo: boolean;
  people: number;
  createdAt: string;
  /** The newest bill or document, a day only; null when nothing yet. */
  lastActivity: string | null;
  billsThisMonth: { count: number; totalMinor: number; currency: string };
  readsThisMonth: number;
  /** null = the install's limit, 0 = no cap, n = that many a month. */
  aiCap: number | null;
  addressOn: boolean;
  sharing: boolean;
  /** The viewer's member id there, when they belong to it (the only way in). */
  myMemberId: string | null;
}

export interface Overview {
  households: number;
  demoHouseholds: number;
  accounts: number;
  accountsThisWeek: number;
  readsThisMonth: number;
  aiLimit: number;
  inboundThisWeek: number;
  waiting: number;
  openRequests: number;
  earlyAccess: boolean;
}

const AI_READ = 'ai_read';
const monthOf = (now: number) => new Date(now).toISOString().slice(0, 7);
const daysAgo = (now: number, n: number) => new Date(now - n * 86_400_000).toISOString();

export function overview(db: Db = getDb(), now = Date.now()): Overview {
  const n = (q: { n: number } | undefined) => q?.n ?? 0;
  const households = db.select().from(household).all();
  return {
    households: households.length,
    demoHouseholds: households.filter((h) => h.isDemo).length,
    accounts: n(db.select({ n: count() }).from(account).get()),
    accountsThisWeek: n(
      db
        .select({ n: count() })
        .from(account)
        .where(gte(account.createdAt, daysAgo(now, 7)))
        .get(),
    ),
    readsThisMonth: households.reduce((s, h) => s + usageCount(h.id, AI_READ, db, now), 0),
    aiLimit: getEnv().AI_MONTHLY_LIMIT,
    inboundThisWeek: n(
      db
        .select({ n: count() })
        .from(sourceDocument)
        .where(
          and(
            isNotNull(sourceDocument.emailMessageId),
            gte(sourceDocument.receivedAt, daysAgo(now, 7)),
          ),
        )
        .get(),
    ),
    waiting: n(
      db
        .select({ n: count() })
        .from(sourceDocument)
        .where(eq(sourceDocument.status, 'needs_review'))
        .get(),
    ),
    openRequests: listRequests(db).filter((r) => !r.decidedAt).length,
    earlyAccess: earlyAccessOn(db),
  };
}

/** Every household as a row of counts (§3b); `viewerAccountId` says which ones the viewer may open. */
export function householdRows(
  viewerAccountId: string | null,
  db: Db = getDb(),
  now = Date.now(),
): HouseholdRow[] {
  const month = monthOf(now);
  const monthStart = `${month}-01`;
  const monthEnd = `${month}-31`;
  const mine = viewerAccountId
    ? new Map(
        db
          .select({ householdId: member.householdId, id: member.id })
          .from(member)
          .where(eq(member.accountId, viewerAccountId))
          .all()
          .map((m) => [m.householdId, m.id]),
      )
    : new Map<string, string>();
  return db
    .select()
    .from(household)
    .orderBy(household.createdAt)
    .all()
    .map((h) => {
      const bills = db
        .select({ n: count(), total: sum(bill.amountMinor) })
        .from(bill)
        .where(
          and(
            eq(bill.householdId, h.id),
            gte(bill.dueDate, monthStart),
            sql`${bill.dueDate} <= ${monthEnd}`,
          ),
        )
        .get();
      const lastBill = db
        .select({ at: bill.createdAt })
        .from(bill)
        .where(eq(bill.householdId, h.id))
        .orderBy(desc(bill.createdAt))
        .limit(1)
        .get()?.at;
      const lastDoc = db
        .select({ at: sourceDocument.createdAt })
        .from(sourceDocument)
        .where(eq(sourceDocument.householdId, h.id))
        .orderBy(desc(sourceDocument.createdAt))
        .limit(1)
        .get()?.at;
      const last =
        [lastBill, lastDoc]
          .filter((x): x is string => !!x)
          .sort()
          .at(-1) ?? null;
      return {
        id: h.id,
        name: h.name,
        type: h.type,
        isDemo: h.isDemo,
        people: db
          .select({ n: count() })
          .from(member)
          .where(and(eq(member.householdId, h.id), isNull(member.activeTo)))
          .get()!.n,
        createdAt: h.createdAt,
        lastActivity: last ? last.slice(0, 10) : null,
        billsThisMonth: {
          count: bills?.n ?? 0,
          totalMinor: Number(bills?.total ?? 0),
          currency: h.currency,
        },
        readsThisMonth: usageCount(h.id, AI_READ, db, now),
        aiCap: h.aiCap,
        addressOn: !!h.billsAlias,
        sharing: h.shareRegional,
        myMemberId: mine.get(h.id) ?? null,
      };
    });
}

/** Every account with how many browsers it is signed in on (§3c). */
export function accountRows(db: Db = getDb()) {
  const devices = new Map(
    db
      .select({ accountId: device.accountId, n: count() })
      .from(device)
      .groupBy(device.accountId)
      .all()
      .map((r) => [r.accountId, r.n]),
  );
  const listed = new Set(listAllowed(db).map((a) => a.email));
  return listAccounts(db).map((a) => ({
    ...a,
    devices: devices.get(a.id) ?? 0,
    listed: listed.has(a.email),
    developer: developerEmails().includes(a.email),
  }));
}

/** Set a household's AI cap (C-D4): null for the install's limit, 0 for none, n a month. */
export function setAiCap(householdId: string, cap: number | null, db: Db = getDb()): void {
  db.update(household)
    .set({ aiCap: cap, updatedAt: new Date().toISOString() })
    .where(eq(household.id, householdId))
    .run();
}

/** One-off: the developers' own households, uncapped by rule before, get an explicit "no cap". */
export function uncapDeveloperHouseholds(db: Db = getDb()): number {
  const devs = developerEmails();
  if (!devs.length) return 0;
  const rows = db
    .select({ householdId: member.householdId, email: account.email })
    .from(member)
    .innerJoin(account, eq(member.accountId, account.id))
    .where(isNotNull(member.accountId))
    .all()
    .filter((r) => devs.includes(r.email.toLowerCase()));
  let n = 0;
  for (const id of new Set(rows.map((r) => r.householdId))) {
    const h = db
      .select({ aiCap: household.aiCap })
      .from(household)
      .where(eq(household.id, id))
      .get();
    if (h && h.aiCap === null) {
      setAiCap(id, 0, db);
      n++;
    }
  }
  return n;
}

/** The data directory by part, and the free space on its volume (Health → Storage). */
export function storage(dataDir?: string): {
  databaseBytes: number;
  filesBytes: number;
  originalsBytes: number;
  previewsBytes: number;
  freeBytes: number | null;
} {
  const p = dataPaths(dataDir);
  const size = (dir: string): number => {
    let total = 0;
    try {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) total += size(full);
        else if (entry.isFile()) total += fs.statSync(full).size;
      }
    } catch {
      // Missing directories count as empty.
    }
    return total;
  };
  let freeBytes: number | null = null;
  try {
    const st = fs.statfsSync(p.root);
    freeBytes = Number(st.bavail) * Number(st.bsize);
  } catch {
    freeBytes = null;
  }
  return {
    databaseBytes: size(p.dbDir),
    filesBytes: size(p.inbox),
    originalsBytes: size(path.join(p.root, 'originals')),
    previewsBytes: size(path.join(p.root, 'previews')),
    freeBytes,
  };
}
