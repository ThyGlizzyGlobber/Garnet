'use server';

import { confirmOwnership, mayChangeOwner } from '@/lib/ownership';
import { refileDocuments } from '@/lib/filing';
import { parseSenderList } from '@/lib/sender-auth';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { CADENCES, SPLIT_MODES, type SplitMode } from '@/db/schema';
import type { ActionState } from '@/components/ui/form';
import { errorText, optStr, str, zodToState } from '@/lib/actions';
import { requireMember, requireDeveloper } from '@/lib/auth/session';
import { refreshAnomalies, resplitBills, setServiceOwner } from '@/lib/bills';
import { parseMoneyToMinor } from '@/lib/format';
import { getHousehold } from '@/lib/households';
import { visibleTo } from '@/lib/scope';
import { listMembers } from '@/lib/members';
import {
  cancelService,
  createService,
  createServiceType,
  getCustomSplits,
  getFixedAmounts,
  getService,
  resumeService,
  mainServiceOf,
  updateService,
  type ServiceInput,
} from '@/lib/services';
import { splitProblem } from '@/lib/splits';
import { UNITS } from '@/lib/units';
import { setRecurring } from '@/lib/recurring';
import { isAdmin } from '@/lib/roles';

const schema = z.object({
  typeSlug: z.string().min(1, 'chooseType'),
  name: z.string().min(1, 'required').max(60),
  provider: z.string().min(1, 'required').max(80),
  accountRef: z.string().max(80),
  cadence: z.enum(CADENCES),
  usageUnit: z.string().refine((u) => u === '' || UNITS.has(u), 'unknownUnit'),
  usageLimit: z
    .string()
    .refine((v) => v === '' || (Number.isFinite(Number(v)) && Number(v) > 0), 'numberAboveZero'),
  splitMode: z.enum(SPLIT_MODES).catch('equal'),
  payerMemberId: z.string(),
  isActive: z.boolean(),
  notes: z.string().max(500),
});

type ReadResult = { ok: true; input: ServiceInput } | { ok: false; state: ActionState };

/**
 * The form, checked. `current` is the service's split mode today: the older
 * "weighted" mode can be kept but never newly chosen.
 */
async function read(
  householdId: string,
  currency: string,
  fd: FormData,
  current: SplitMode | null = null,
): Promise<ReadResult> {
  const parsed = schema.safeParse({
    typeSlug: str(fd, 'typeSlug'),
    name: str(fd, 'name'),
    provider: str(fd, 'provider'),
    accountRef: str(fd, 'accountRef'),
    cadence: str(fd, 'cadence'),
    usageUnit: str(fd, 'usageUnit'),
    usageLimit: str(fd, 'usageLimit'),
    splitMode: str(fd, 'splitMode'),
    payerMemberId: str(fd, 'payerMemberId'),
    isActive: fd.get('isActive') === 'on',
    notes: str(fd, 'notes'),
  });
  if (!parsed.success) return { ok: false, state: await zodToState(parsed.error) };
  const te = await errorText();
  const v = parsed.data;
  if (v.splitMode === 'weighted' && current !== 'weighted') v.splitMode = 'equal';
  const members = listMembers(householdId);
  const customSplits: Record<string, number> = {};
  const fixedAmounts: Record<string, number> = {};
  if (v.splitMode === 'percent') {
    for (const m of members) {
      const raw = str(fd, `pct_${m.id}`);
      if (!raw) continue;
      const pct = Number(raw.replace('%', ''));
      if (!Number.isFinite(pct) || pct < 0)
        return { ok: false, state: { error: te('percentFor', { name: m.name }) } };
      if (pct > 0) customSplits[m.id] = pct;
    }
    const problem = splitProblem('percent', { percents: customSplits });
    if (problem?.kind === 'percent-total')
      return {
        ok: false,
        state: { error: te('percentTotal', { total: problem.total }) },
      };
  } else if (v.splitMode === 'fixed') {
    for (const m of members) {
      const raw = str(fd, `amt_${m.id}`);
      if (!raw) continue;
      const minor = parseMoneyToMinor(raw, currency);
      if (minor === null || minor < 0)
        return { ok: false, state: { error: te('amountFor', { name: m.name }) } };
      fixedAmounts[m.id] = minor;
    }
    if (splitProblem('fixed', { amounts: fixedAmounts }))
      return {
        ok: false,
        state: { error: te('amountNeeded') },
      };
  }
  // Who pays no share of it (D14): the editor's "In this split" boxes, when it was shown.
  const notSplitWith =
    fd.get('splitEditor') === 'on'
      ? members.filter((m) => fd.get(`in_${m.id}`) !== 'on').map((m) => m.id)
      : undefined;
  return {
    ok: true,
    input: {
      typeSlug: v.typeSlug,
      name: v.name,
      provider: v.provider,
      ...(notSplitWith ? { notSplitWith } : {}),
      accountRef: v.accountRef || null,
      cadence: v.cadence,
      usageUnit: v.usageUnit || null,
      // A limit only means something with a unit to measure it in.
      usageLimitMonthly: v.usageUnit && v.usageLimit ? Number(v.usageLimit) : null,
      splitMode: v.splitMode,
      payerMemberId: v.payerMemberId || null,
      isActive: v.isActive,
      notes: v.notes || null,
      trustedSenders: parseSenderList(str(fd, 'trustedSenders')),
      autoPay: fd.get('autoPay') === 'on',
      recurring: fd.get('recurring') === 'on',
      seasonal: fd.get('seasonal') === 'on',
      ...(v.splitMode === 'fixed'
        ? { fixedAmounts }
        : v.splitMode === 'percent'
          ? { customSplits }
          : {}),
    },
  };
}

/** Only admins decide how a service is split and who pays it; for anyone else those fields are dropped. */
function splitFields(input: ServiceInput): Partial<ServiceInput> {
  return {
    splitMode: input.splitMode,
    payerMemberId: input.payerMemberId,
    customSplits: input.customSplits,
    fixedAmounts: input.fixedAmounts,
    notSplitWith: input.notSplitWith,
  };
}

function withoutSplit(input: ServiceInput): ServiceInput {
  const rest = { ...input };
  for (const k of Object.keys(splitFields(input)) as (keyof ServiceInput)[]) delete rest[k];
  return rest;
}

/** The split as stored, to tell whether saving the form changed it. */
function splitKey(householdId: string, id: string): string {
  const s = getService(householdId, id)!;
  return JSON.stringify([
    s.splitMode,
    s.payerMemberId,
    getCustomSplits(householdId, id),
    getFixedAmounts(householdId, id),
    s.notSplitWith,
  ]);
}

export async function createServiceAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const me = await requireMember();
  const hh = getHousehold(me.householdId)!;
  const r = await read(me.householdId, hh.currency, fd);
  if (!r.ok) return r.state;
  // "Just for me": the member creating it owns it.
  const personal = fd.get('personal') === 'on';
  const admin = isAdmin(me);
  let created: ReturnType<typeof createService>;
  try {
    created = createService(me.householdId, {
      // A member setting one up splits it evenly and pays it; an admin can change that.
      ...(admin ? r.input : { ...withoutSplit(r.input), splitMode: 'equal', payerMemberId: me.id }),
      isActive: true,
      ownerMemberId: personal ? me.id : null,
    });
  } catch (e) {
    return { error: (e as Error).message };
  }
  revalidatePath('/services');
  // A new sub-service (Netflix, Bupa) or someone's own opens its page.
  redirect(mainServiceOf(created) || personal ? `/services/${created.id}` : '/services');
}

export async function updateServiceAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const me = await requireMember();
  const id = str(fd, 'id');
  const existing = getService(me.householdId, id);
  const te = await errorText();
  if (!existing || !visibleTo(existing.ownerMemberId, me.id))
    return { error: te('serviceNotFound') };
  const hh = getHousehold(me.householdId)!;
  const r = await read(me.householdId, hh.currency, fd, existing.splitMode);
  if (!r.ok) return r.state;
  const personal = fd.get('personal') === 'on';
  const admin = isAdmin(me);
  try {
    // Household ↔ personal: only its owner hands it back; whoever brought its
    // bills in (else an admin or its payer) can make it theirs. Its bills move with it.
    if (personal !== !!existing.ownerMemberId) {
      if (!mayChangeOwner(me.householdId, me, existing)) return { error: te('makePersonal') };
      setServiceOwner(me.householdId, id, personal ? me.id : null);
    }
    const before = splitKey(me.householdId, id);
    updateService(me.householdId, id, admin ? r.input : withoutSplit(r.input));
    // A new split applies to later bills, and to earlier ones nobody has paid a share of when asked.
    if (admin && fd.get('resplit') === 'on' && splitKey(me.householdId, id) !== before)
      resplitBills(me.householdId, id);
    // Seasonal on/off changes how its bills are judged Unusual.
    refreshAnomalies(me.householdId, id);
    // A renamed service (or one made personal) files its bills under the new name.
    refileDocuments(me.householdId);
    // Its "Just for me" box has been seen and saved: nobody needs asking about it.
    confirmOwnership(me.householdId, id);
  } catch (e) {
    return { error: (e as Error).message };
  }
  revalidatePath('/services');
  redirect(`/services/${id}`);
}

/**
 * Operator: add a service type. The catalog is shared by every household on the
 * install (and every type goes into the AI reader's prompt), so households can't
 * add to it; "Other" plus the service's own name covers anything missing.
 */
export async function createServiceTypeAction(fd: FormData): Promise<void> {
  await requireDeveloper();
  const label = str(fd, 'label').slice(0, 40);
  const unit = optStr(fd, 'defaultUnit');
  if (!label || (unit && !UNITS.has(unit))) return;
  try {
    createServiceType({ slug: label, label, defaultUnit: unit });
  } catch {
    // Already in the catalog.
  }
  revalidatePath('/services');
}

/** Cancel a sub-service (their Netflix): kept with its bills, marked who cancelled it and when. */
export async function cancelServiceAction(fd: FormData): Promise<void> {
  const me = await requireMember();
  const id = str(fd, 'id');
  const svc = getService(me.householdId, id);
  if (!svc || !visibleTo(svc.ownerMemberId, me.id) || !svc.type.hasSubServices) return;
  cancelService(me.householdId, id, me.id);
  revalidatePath('/services');
  revalidatePath(`/services/${id}`);
  revalidatePath('/');
}

/** Undo a cancellation: the sub-service is going again. */
export async function resumeServiceAction(fd: FormData): Promise<void> {
  const me = await requireMember();
  const id = str(fd, 'id');
  const svc = getService(me.householdId, id);
  if (!svc || !visibleTo(svc.ownerMemberId, me.id) || !svc.cancelledAt) return;
  resumeService(me.householdId, id);
  revalidatePath('/services');
  revalidatePath(`/services/${id}`);
  revalidatePath('/');
}

/** Recurring on or off from the service's page (or a bill's): the next charge is expected at the latest price. */
export async function setRecurringAction(fd: FormData): Promise<void> {
  const me = await requireMember();
  const id = str(fd, 'id');
  const svc = getService(me.householdId, id);
  if (!svc || !visibleTo(svc.ownerMemberId, me.id) || svc.cadence === 'irregular') return;
  setRecurring(me.householdId, id, str(fd, 'on') === 'true');
  revalidatePath(`/services/${id}`);
  revalidatePath('/services');
  revalidatePath('/bills');
  revalidatePath('/');
}
