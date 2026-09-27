'use server';

import { parseSenderList } from '@/lib/sender-auth';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { CADENCES, SPLIT_MODES } from '@/db/schema';
import type { ActionState } from '@/components/ui/form';
import { optStr, str, zodToState } from '@/lib/actions';
import { requireMember } from '@/lib/auth/session';
import { listMembers } from '@/lib/members';
import { createService, createServiceType, updateService, type ServiceInput } from '@/lib/services';
import { UNITS } from '@/lib/units';

const schema = z.object({
  typeSlug: z.string().min(1, 'Choose a type'),
  name: z.string().min(1, 'Required').max(60),
  provider: z.string().min(1, 'Required').max(80),
  accountRef: z.string().max(80),
  cadence: z.enum(CADENCES),
  usageUnit: z.string().refine((u) => u === '' || UNITS.has(u), 'Unknown unit'),
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
      splitMode: v.splitMode,
      payerMemberId: v.payerMemberId || null,
      colour: v.colour,
      isActive: v.isActive,
      notes: v.notes || null,
      trustedSenders: parseSenderList(str(fd, 'trustedSenders')),
      customSplits,
    },
  };
}

export async function createServiceAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const me = await requireMember();
  const r = read(me.householdId, fd);
  if (!r.ok) return r.state;
  try {
    createService(me.householdId, { ...r.input, isActive: true });
  } catch (e) {
    return { error: (e as Error).message };
  }
  revalidatePath('/services');
  redirect('/services');
}

export async function updateServiceAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const me = await requireMember();
  const id = str(fd, 'id');
  const r = read(me.householdId, fd);
  if (!r.ok) return r.state;
  try {
    updateService(me.householdId, id, r.input);
  } catch (e) {
    return { error: (e as Error).message };
  }
  revalidatePath('/services');
  redirect('/services');
}

export async function createServiceTypeAction(fd: FormData): Promise<void> {
  await requireMember();
  const label = str(fd, 'label');
  if (!label) return;
  createServiceType({ slug: label, label, defaultUnit: optStr(fd, 'defaultUnit') });
  revalidatePath('/services');
}
