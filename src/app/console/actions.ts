'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { str } from '@/lib/actions';
import {
  allowEmails,
  decideRequest,
  disallowEmail,
  earlyAccessOn,
  setEarlyAccess,
} from '@/lib/access';
import { getAccount, isDeveloper, membershipsFor } from '@/lib/accounts';
import { forgetAllDevices } from '@/lib/auth/devices';
import { authState } from '@/lib/auth/session';
import { clearAlias } from '@/lib/bills-address';
import { setAiCap } from '@/lib/console';
import { exitDemo } from '@/lib/demo';
import { composeEmail, sendEmail } from '@/lib/email';
import { appUrl } from '@/lib/env';
import { getHousehold } from '@/lib/households';
import { getDb } from '@/db/client';
import { account } from '@/db/schema';
import { eq } from 'drizzle-orm';

/** Every console action is a developer's; returns their account. */
async function developer() {
  const s = await authState();
  if ((s.kind !== 'ok' && s.kind !== 'no-household') || !s.account || !isDeveloper(s.account))
    redirect('/account');
  return s.account;
}

export async function setEarlyAccessAction(fd: FormData): Promise<void> {
  await developer();
  setEarlyAccess(str(fd, 'on') === 'on');
  revalidatePath('/console');
  redirect('/console/access');
}

export async function allowEmailsAction(fd: FormData): Promise<void> {
  const me = await developer();
  const emails = str(fd, 'emails')
    .split(/[\s,;]+/)
    .filter(Boolean);
  const added = allowEmails(emails, { accountId: me.id, note: str(fd, 'note') || null });
  revalidatePath('/console');
  redirect(`/console/access?added=${added}`);
}

export async function disallowEmailAction(fd: FormData): Promise<void> {
  await developer();
  disallowEmail(str(fd, 'email'));
  revalidatePath('/console');
  redirect('/console/access');
}

/** Approve (and email them that they're in) or decline a request. */
export async function decideRequestAction(fd: FormData): Promise<void> {
  const me = await developer();
  const outcome = str(fd, 'outcome') === 'approved' ? 'approved' : 'declined';
  const r = decideRequest(str(fd, 'id'), outcome, me.id);
  if (r && outcome === 'approved' && earlyAccessOn()) {
    const te = await getTranslations('email.accessApproved');
    const app = (await getTranslations('app'))('name');
    await sendEmail(
      composeEmail({
        to: r.email,
        subject: te('subject', { app }),
        blocks: [
          { p: te('intro', { name: r.name, app }) },
          {
            button: {
              label: te('button'),
              href: `${appUrl()}/login?email=${encodeURIComponent(r.email)}`,
            },
          },
        ],
      }),
    );
  }
  revalidatePath('/console');
  redirect('/console/access');
}

/** A household's AI cap: blank = the install's limit, 0 = none, n a month (C-D4). */
export async function setAiCapAction(fd: FormData): Promise<void> {
  await developer();
  const id = str(fd, 'householdId');
  if (!getHousehold(id)) redirect('/console/households');
  const raw = str(fd, 'cap').trim();
  const cap = raw === '' ? null : Number(raw);
  if (cap !== null && (!Number.isInteger(cap) || cap < 0)) redirect('/console/households');
  setAiCap(id, cap);
  revalidatePath('/console');
  redirect('/console/households');
}

export async function addressOffAction(fd: FormData): Promise<void> {
  await developer();
  const id = str(fd, 'householdId');
  if (getHousehold(id)) clearAlias(id);
  revalidatePath('/console');
  redirect('/console/households');
}

export async function deleteDemoHouseholdAction(fd: FormData): Promise<void> {
  await developer();
  const hh = getHousehold(str(fd, 'householdId'));
  if (hh?.isDemo) exitDemo(hh.id);
  revalidatePath('/', 'layout');
  redirect('/console/households');
}

export async function signOutEverywhereAction(fd: FormData): Promise<void> {
  await developer();
  const a = getAccount(str(fd, 'accountId'));
  if (a) forgetAllDevices(a.id);
  revalidatePath('/console');
  redirect('/console/accounts');
}

/** Only an account that belongs to no household (C-D6: never a household's data through here). */
export async function deleteAccountAction(fd: FormData): Promise<void> {
  const me = await developer();
  const a = getAccount(str(fd, 'accountId'));
  if (a && a.id !== me.id && membershipsFor(a.id).length === 0)
    getDb().delete(account).where(eq(account.id, a.id)).run();
  revalidatePath('/console');
  redirect('/console/accounts');
}
