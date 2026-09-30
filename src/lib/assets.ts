import { and, asc, eq, inArray } from 'drizzle-orm';
import { getDb, type Db } from '@/db/client';
import { asset, bill, service, sourceDocument, type Asset, type AssetKind } from '@/db/schema';
import { getBill, listBills, moveBill, type BillDetail } from '@/lib/bills';
import { listMembers } from '@/lib/members';
import { confirmOwnership, mayMoveBill } from '@/lib/ownership';
import { sameProvider } from '@/lib/provider-match';
import { isAdmin } from '@/lib/roles';
import { ownerCondition, visibleTo, type Scope } from '@/lib/scope';
import { assetKindOf } from '@/lib/service-categories';
import {
  createService,
  listServiceTypes,
  listServices,
  type ServiceWithType,
} from '@/lib/services';
import { ulid } from '@/lib/ids';

/**
 * Vehicles and policies (SCOPE.md, "Vehicles and Health"). A vehicle is
 * entered once and its bills of every Vehicles sub-service (Registration,
 * Car insurance, Roadside assistance, Repairs & servicing) are filed under
 * it; a policy the same for Health (Health insurance, Ambulance cover).
 *
 * The one rule that keeps everything else working: a bill filed under a
 * vehicle is on the vehicle's side. A household vehicle's bills are on the
 * household's services (split as usual); someone's own vehicle's bills are on
 * their own services (only they see them). Filing a bill under a vehicle on
 * the other side moves it to a service of the same type on that side, set up
 * when there isn't one.
 */

/** "abc-123" → "ABC123": capitals, letters and digits only; null when too short to tell apart. */
export function identifierKey(raw: string | null | undefined): string | null {
  const key = (raw ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  return key.length >= 3 ? key : null;
}

/** Matching keys for what a bill prints (plates, VINs, policy and membership numbers). */
export function refKeys(refs: (string | null | undefined)[]): string[] {
  return [...new Set(refs.map(identifierKey).filter((k): k is string => !!k))];
}

export function listAssets(
  householdId: string,
  opts: { kind?: AssetKind } & Scope = {},
  db: Db = getDb(),
): Asset[] {
  return db
    .select()
    .from(asset)
    .where(
      and(
        eq(asset.householdId, householdId),
        opts.kind ? eq(asset.kind, opts.kind) : undefined,
        ownerCondition(asset.ownerMemberId, opts),
      ),
    )
    .orderBy(asc(asset.name))
    .all();
}

export function getAsset(householdId: string, id: string, db: Db = getDb()): Asset | null {
  return (
    db
      .select()
      .from(asset)
      .where(and(eq(asset.householdId, householdId), eq(asset.id, id)))
      .get() ?? null
  );
}

export interface AssetInput {
  kind: AssetKind;
  name: string;
  identifier?: string | null;
  /** Null = the household's. */
  ownerMemberId?: string | null;
  createdByMemberId?: string | null;
}

export function createAsset(householdId: string, input: AssetInput, db: Db = getDb()): Asset {
  const name = input.name.trim();
  if (!name) throw new Error('Give it a name');
  const members = listMembers(householdId, db);
  if (input.ownerMemberId && !members.some((m) => m.id === input.ownerMemberId))
    throw new Error('Not a member of this household');
  const now = new Date().toISOString();
  const id = ulid();
  const identifier = input.identifier?.trim() || null;
  db.insert(asset)
    .values({
      id,
      householdId,
      kind: input.kind,
      name,
      identifier,
      identifierKey: identifierKey(identifier),
      ownerMemberId: input.ownerMemberId ?? null,
      createdByMemberId:
        input.createdByMemberId && members.some((m) => m.id === input.createdByMemberId)
          ? input.createdByMemberId
          : null,
      createdAt: now,
      updatedAt: now,
    })
    .run();
  return getAsset(householdId, id, db)!;
}

/** Rename it or change its plate or policy number. Whose it is changes through setAssetOwner. */
export function updateAsset(
  householdId: string,
  id: string,
  input: { name?: string; identifier?: string | null },
  db: Db = getDb(),
): Asset {
  const a = getAsset(householdId, id, db);
  if (!a) throw new Error('Not found');
  const name = input.name?.trim();
  if (input.name !== undefined && !name) throw new Error('Give it a name');
  const identifier =
    input.identifier === undefined ? a.identifier : input.identifier?.trim() || null;
  db.update(asset)
    .set({
      ...(name ? { name } : {}),
      identifier,
      identifierKey: identifierKey(identifier),
      updatedAt: new Date().toISOString(),
    })
    .where(eq(asset.id, id))
    .run();
  return getAsset(householdId, id, db)!;
}

/** Remove a vehicle or policy. Its bills stay, waiting to be filed under another. */
export function deleteAsset(householdId: string, id: string, db: Db = getDb()): void {
  db.transaction((tx) => {
    tx.update(bill)
      .set({ assetId: null })
      .where(and(eq(bill.householdId, householdId), eq(bill.assetId, id)))
      .run();
    tx.delete(asset)
      .where(and(eq(asset.householdId, householdId), eq(asset.id, id)))
      .run();
  });
}

/**
 * May this member rename, remove or change a vehicle or policy? Their own,
 * yes. A household one: an admin, or whoever added it.
 */
export function canEditAsset(
  me: { id: string; role: string },
  a: Pick<Asset, 'ownerMemberId' | 'createdByMemberId'>,
): boolean {
  if (a.ownerMemberId) return a.ownerMemberId === me.id;
  return isAdmin(me) || a.createdByMemberId === me.id;
}

/**
 * The service a bill of this type goes on for this side (the household's, or
 * a member's own): the one from the same provider, else the only one of the
 * type there, else a new one set up like the service the bill is on now
 * (same provider, cadence and payment) and split evenly. No "Who's this
 * for?" question: the vehicle or policy decides.
 */
function serviceFor(
  householdId: string,
  input: {
    typeSlug: string;
    ownerMemberId: string | null;
    like: ServiceWithType;
    setUpByMemberId: string | null;
  },
  db: Db,
): { service: ServiceWithType; created: boolean } {
  const side = listServices(householdId, { includeInactive: true, everyone: true }, db).filter(
    (s) =>
      s.typeSlug === input.typeSlug && (s.ownerMemberId ?? null) === (input.ownerMemberId ?? null),
  );
  const found =
    side.find((s) => s.isActive && sameProvider(s.provider, input.like.provider)) ??
    side.find((s) => sameProvider(s.provider, input.like.provider)) ??
    (side.filter((s) => s.isActive).length === 1 ? side.find((s) => s.isActive) : undefined);
  if (found) return { service: found, created: false };
  const type = listServiceTypes(db).find((t) => t.slug === input.typeSlug);
  if (!type) throw new Error('Service type not found');
  const like = input.like;
  const admin = listMembers(householdId, db).find((m) => isAdmin(m))?.id ?? null;
  const created = createService(
    householdId,
    {
      typeSlug: type.slug,
      name: side.some((s) => s.name.toLowerCase() === type.label.toLowerCase())
        ? `${type.label} (${like.provider})`
        : type.label,
      provider: like.provider,
      accountRef: like.accountRef,
      cadence: like.cadence,
      usageUnit: type.defaultUnit ?? null,
      splitMode: 'equal',
      payerMemberId: input.ownerMemberId ?? (like.ownerMemberId ? admin : like.payerMemberId),
      ownerMemberId: input.ownerMemberId,
      setUpByMemberId: input.setUpByMemberId,
      autoPay: like.autoPay,
      trustedSenders: like.trustedSenders,
    },
    db,
  );
  confirmOwnership(householdId, created.id, db);
  return { service: created, created: true };
}

/**
 * File a bill under a vehicle or policy (or under none), and at the same time
 * under another sub-service when `typeSlug` says so: a rego notice that landed
 * on Building insurance goes to Registration · Ford Fiesta in one step. The
 * bill moves to the vehicle's side (see the rule above). With `me`, only what
 * that member may do (mayMoveBill); without, the caller has checked (the
 * pipeline, a vehicle changing hands).
 */
export function fileBillUnder(
  householdId: string,
  billId: string,
  target: {
    assetId: string | null;
    typeSlug?: string | null;
    /** A service someone picked: used when it's of that type and on the right side. */
    serviceId?: string | null;
  },
  opts: { me?: { id: string; role: string } } = {},
  db: Db = getDb(),
): BillDetail {
  const b = getBill(householdId, billId, db);
  if (!b) throw new Error('Bill not found');
  const a = target.assetId ? getAsset(householdId, target.assetId, db) : null;
  if (target.assetId && !a) throw new Error('Not found');
  const me = opts.me;
  if (me && (!visibleTo(b.ownerMemberId, me.id) || (a && !visibleTo(a.ownerMemberId, me.id))))
    throw new Error('Not found');
  const typeSlug = target.typeSlug || b.service.typeSlug;
  const type = listServiceTypes(db).find((t) => t.slug === typeSlug);
  if (!type) throw new Error('Service type not found');
  if (a && assetKindOf(type.category) !== a.kind)
    throw new Error(
      a.kind === 'vehicle'
        ? 'Only vehicle bills can be filed under a vehicle'
        : 'Only health bills can be filed under a policy',
    );
  const owner = a ? (a.ownerMemberId ?? null) : (b.ownerMemberId ?? null);
  const stays =
    b.service.typeSlug === typeSlug &&
    (b.ownerMemberId ?? null) === owner &&
    (!target.serviceId || target.serviceId === b.serviceId);
  if (!stays && me && !mayMoveBill(householdId, me, b, { ownerMemberId: owner }, db))
    throw new Error(
      'Only whoever brought this bill in can file it under their own vehicle or policy',
    );
  if (!stays) {
    const picked = target.serviceId
      ? listServices(householdId, { includeInactive: true, everyone: true }, db).find(
          (s) =>
            s.id === target.serviceId &&
            s.typeSlug === typeSlug &&
            (s.ownerMemberId ?? null) === owner,
        )
      : undefined;
    const { service: svc, created } = picked
      ? { service: picked, created: false }
      : serviceFor(
          householdId,
          { typeSlug, ownerMemberId: owner, like: b.service, setUpByMemberId: me?.id ?? null },
          db,
        );
    try {
      moveBill(householdId, b.id, svc.id, db);
    } catch (e) {
      // Nothing moved: don't leave an empty service behind.
      if (created) db.delete(service).where(eq(service.id, svc.id)).run();
      throw e;
    }
  }
  db.update(bill)
    .set({ assetId: a?.id ?? null, updatedAt: new Date().toISOString() })
    .where(and(eq(bill.householdId, householdId), eq(bill.id, b.id)))
    .run();
  return getBill(householdId, b.id, db)!;
}

/**
 * A newly analysed bill that prints a plate or policy number one vehicle or
 * policy has: file it there. Only among the ones the document could reach
 * (its scope: the household's plus the member it came from, or anyone's for
 * mail straight from the provider). Returns the vehicle or policy, or null.
 */
export function autoFileBill(
  householdId: string,
  billId: string,
  scope: Scope,
  db: Db = getDb(),
): Asset | null {
  const b = getBill(householdId, billId, db);
  if (!b || b.assetId || !b.assetRefs?.length) return null;
  const kind = assetKindOf(b.service.type.category);
  if (!kind) return null;
  const refs = new Set(b.assetRefs);
  const matches = listAssets(householdId, { kind, ...scope }, db).filter(
    (a) => a.identifierKey && refs.has(a.identifierKey),
  );
  if (matches.length !== 1) return null;
  try {
    fileBillUnder(householdId, b.id, { assetId: matches[0]!.id }, {}, db);
    return matches[0]!;
  } catch {
    // Housemates have paid shares on the other side: it waits for a person.
    return null;
  }
}

/** Does this text print the identifier (spaced or dashed any way: "ABC 123", "abc-123")? */
function prints(text: string, key: string): boolean {
  const pattern = key
    .split('')
    .map((c) => c.replace(/[^A-Z0-9]/g, ''))
    .join('[\\s.\\-]?');
  return new RegExp(`(?<![A-Z0-9])${pattern}(?![A-Z0-9])`, 'i').test(text);
}

/**
 * A vehicle or policy was added, or its plate or number changed: file the
 * bills waiting under "No vehicle yet" that print it, the ones this member
 * may file (see fileBillUnder). Bills analysed before plates were noted are
 * checked against their document's text. Returns how many were filed.
 */
export function fileWaitingBills(
  householdId: string,
  a: Asset,
  me: { id: string; role: string },
  db: Db = getDb(),
): number {
  const key = a.identifierKey;
  if (!key) return 0;
  const waiting = listBills(householdId, { viewer: me.id }, db).filter(
    (b) => !b.assetId && assetKindOf(b.service.type.category) === a.kind,
  );
  if (!waiting.length) return 0;
  const docIds = waiting
    .filter((b) => !b.assetRefs?.length && b.sourceDocumentId)
    .map((b) => b.sourceDocumentId!);
  const texts = new Map(
    docIds.length && key.length >= 4
      ? db
          .select({ id: sourceDocument.id, json: sourceDocument.extractionJson })
          .from(sourceDocument)
          .where(inArray(sourceDocument.id, docIds))
          .all()
          .map((d) => [d.id, previewOf(d.json)])
      : [],
  );
  let filed = 0;
  for (const b of waiting) {
    const hit = b.assetRefs?.length
      ? b.assetRefs.includes(key)
      : !!b.sourceDocumentId && prints(texts.get(b.sourceDocumentId) ?? '', key);
    if (!hit) continue;
    try {
      fileBillUnder(householdId, b.id, { assetId: a.id }, { me }, db);
      filed++;
    } catch {
      // Not this member's to file (or locked by paid shares): it keeps waiting.
    }
  }
  return filed;
}

function previewOf(json: string | null): string {
  if (!json) return '';
  try {
    return (JSON.parse(json) as { textPreview?: string }).textPreview ?? '';
  } catch {
    return '';
  }
}

/**
 * Make a vehicle or policy someone's own, or the household's. Its bills move
 * with it (see fileBillUnder). Refused, with nothing changed, when one of its
 * bills can't go: a housemate has paid a share of it, or this member may not
 * take it out of the household (mayMoveBill).
 */
export function setAssetOwner(
  householdId: string,
  id: string,
  ownerMemberId: string | null,
  me: { id: string; role: string },
  db: Db = getDb(),
): Asset {
  const a = getAsset(householdId, id, db);
  if (!a) throw new Error('Not found');
  if ((a.ownerMemberId ?? null) === (ownerMemberId ?? null)) return a;
  if (ownerMemberId && !listMembers(householdId, db).some((m) => m.id === ownerMemberId))
    throw new Error('Not a member of this household');
  const bills = listBills(householdId, { everyone: true }, db).filter((b) => b.assetId === id);
  for (const b of bills) {
    if (b.shares.some((s) => s.paidAt && s.paidMethod !== 'payer'))
      throw new Error('Housemates have paid shares of its bills, so it stays the household’s');
    if (!mayMoveBill(householdId, me, b, { ownerMemberId }, db))
      throw new Error('Only whoever brought its bills in can make it their own');
  }
  db.update(asset)
    .set({ ownerMemberId, updatedAt: new Date().toISOString() })
    .where(eq(asset.id, id))
    .run();
  for (const b of bills) fileBillUnder(householdId, b.id, { assetId: id }, {}, db);
  return getAsset(householdId, id, db)!;
}
