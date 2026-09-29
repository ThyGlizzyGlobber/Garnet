'use server';

import { parseSenderList } from '@/lib/sender-auth';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { CADENCES, SPLIT_MODES } from '@/db/schema';
import type { ActionState } from '@/components/ui/form';
import { optStr, str, zodToState } from '@/lib/actions';
import { requireMember } from '@/lib/auth/session';
import { refreshAnomalies, setServiceOwner } from '@/lib/bills';
import { visibleTo } from '@/lib/scope';
import { listMembers } from '@/lib/members';
import {
  createService,
  createServiceType,
  getService,
  updateService,
  type ServiceInput,
} from '@/lib/services';
import { UNITS } from '@/lib/units';

const schema = z.object({
  typeSlug: z.string().min(1, 'Choose a type'),
  name: z.string().min(1, 'Required').max(60),
  provider: z.string().min(1, 'Required').max(80),
  accountRef: z.string().max(80),
  cadence: z.enum(CADENCES),
  usageUnit: z.string().refine((u) => u === '' || UNITS.has(u), 'Unknown unit'),
  usageLimit: z
    .string()
    .refine(
      (v) => v === '' || (Number.isFinite(Number(v)) && Number(v) > 0),
      'Enter a number above zero',
    ),
  splitMode: z.enum(SPLIT_MODES),
  payerMemberId: z.string(),
  colour: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Pick a colour'),
  isActive: z.boolean(),
  notes: z.string().max(500),
});

type ReadResult = { ok: true; input: ServiceInput } | { ok: false; state: ActionState };

function read(householdId: string, fd: FormData): ReadResult {
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
    colour: str(fd, 'colour') || '#0a84ff',
    isActive: fd.get('isActive') === 'on',
    notes: str(fd, 'notes'),
  });
  if (!parsed.success) return { ok: false, state: zodToState(parsed.error) };
  const v = parsed.data;
  const customSplits: Record<string, number> = {};
  if (v.splitMode === 'custom') {
    for (const m of listMembers(householdId)) {
      const w = Number(str(fd, `weight_${m.id}`) || '0');
      if (Number.isFinite(w) && w > 0) customSplits[m.id] = w;
    }
    if (Object.keys(customSplits).length === 0)
      return { ok: false, state: { error: 'Give at least one member a weight above zero.' } };
  }
  return {
    ok: true,
    input: {
      typeSlug: v.typeSlug,
      name: v.name,
      provider: v.provider,
      accountRef: v.accountRef || null,
      cadence: v.cadence,
      usageUnit: v.usageUnit || null,
      // A limit only means something with a unit to measure it in.
      usageLimitMonthly: v.usageUnit && v.usageLimit ? Number(v.usageLimit) : null,
      splitMode: v.splitMode,
      payerMemberId: v.payerMemberId || null,
      colour: v.colour,
      isActive: v.isActive,
      notes: v.notes || null,
      trustedSenders: parseSenderList(str(fd, 'trustedSenders')),
      autoPay: fd.get('autoPay') === 'on',
      seasonal: fd.get('seasonal') === 'on',
      customSplits,
    },
  };
}

export async function createServiceAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const me = await requireMember();
  const r = read(me.householdId, fd);
  if (!r.ok) return r.state;
  // "Just for me": the member creating it owns it.
  const personal = fd.get('personal') === 'on';
  let id: string;
  try {
    id = createService(me.householdId, {
      ...r.input,
      isActive: true,
      ownerMemberId: personal ? me.id : null,
    }).id;
  } catch (e) {
    return { error: (e as Error).message };
  }
  revalidatePath('/services');
  redirect(personal ? `/services/${id}` : '/services');
}

export async function updateServiceAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const me = await requireMember();
  const id = str(fd, 'id');
  const existing = getService(me.householdId, id);
  if (!existing || !visibleTo(existing.ownerMemberId, me.id)) return { error: 'Service not found' };
  const r = read(me.householdId, fd);
  if (!r.ok) return r.state;
  const personal = fd.get('personal') === 'on';
  try {
    // Household ↔ personal: only its owner hands it back; only an admin or its
    // payer can make a household service their own. Its bills move with it.
    if (personal !== !!existing.ownerMemberId) {
      if (!canChangePersonal(me, existing))
        return { error: 'Only an admin or the person who pays it can make it personal' };
      setServiceOwner(me.householdId, id, personal ? me.id : null);
    }
    updateService(me.householdId, id, r.input);
    // Seasonal on/off changes how its bills are judged Unusual.
    refreshAnomalies(me.householdId, id);
  } catch (e) {
    return { error: (e as Error).message };
  }
  revalidatePath('/services');
  redirect(`/services/${id}`);
}

/** May this member switch the service between household and personal? */
function canChangePersonal(
  me: { id: string; role: string },
  svc: { ownerMemberId: string | null; payerMemberId: string | null },
): boolean {
  if (svc.ownerMemberId) return svc.ownerMemberId === me.id;
  return me.role === 'owner' || svc.payerMemberId === me.id;
}

export async function createServiceTypeAction(fd: FormData): Promise<void> {
  await requireMember();
  const label = str(fd, 'label');
  if (!label) return;
  createServiceType({ slug: label, label, defaultUnit: optStr(fd, 'defaultUnit') });
  revalidatePath('/services');
}
