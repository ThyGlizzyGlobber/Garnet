import { createHmac } from 'node:crypto';
import { and, eq, gte, isNull, lte } from 'drizzle-orm';
import { createTranslator } from 'next-intl';
import { getDb, type Db } from '@/db/client';
import {
  account,
  bill,
  member,
  notificationLog,
  service,
  share,
  type Household,
  type Member,
} from '@/db/schema';
import messages from '../../messages/en.json';
import { safeEqual } from '@/lib/auth/tokens';
import { getBill } from '@/lib/bills';
import { addDays, todayIn } from '@/lib/dates';
import { composeEmail, sendEmail, type EmailBlock } from '@/lib/email';
import { appUrl, getEnv } from '@/lib/env';
import { formatDate, formatMoney } from '@/lib/format';
import { getHousehold, listHouseholds } from '@/lib/households';
import { ulid } from '@/lib/ids';
import { getMember, listMembers } from '@/lib/members';
import { daysUntil } from '@/lib/periods';

/**
 * Household emails: a new bill (each person's share and how to pay it),
 * reminders before and after a share is due, and payment problems reported by
 * a provider. Sent to members' sign-in emails; each member can switch each
 * category off, and every email carries a one-click way to stop it.
 * Works outside a request (the reminder timer), so copy comes from a plain
 * translator rather than next-intl's request helpers.
 */

export type NotifyCategory = 'bills' | 'reminders' | 'problems';
const PREF: Record<NotifyCategory, 'notifyBills' | 'notifyReminders' | 'notifyProblems'> = {
  bills: 'notifyBills',
  reminders: 'notifyReminders',
  problems: 'notifyProblems',
};

const t = createTranslator({ locale: 'en', messages, namespace: 'notify' });

/** Reminders go out between these local hours only. */
const QUIET_START = 8;
const QUIET_END = 20;
/** Days before the due date for the first reminder. */
export const REMIND_DAYS_BEFORE = 3;
/** Overdue reminders: first day overdue, then weekly, this many times. */
const OVERDUE_REMINDERS = 3;

// ─── Unsubscribe links ───────────────────────────────────────────────────────

function unsubscribeSig(memberId: string, category: NotifyCategory): string {
  return createHmac('sha256', getEnv().AUTH_SECRET)
    .update(`unsubscribe:${memberId}:${category}`)
    .digest('base64url');
}

export function unsubscribeUrl(memberId: string, category: NotifyCategory): string {
  const q = new URLSearchParams({
    m: memberId,
    c: category,
    t: unsubscribeSig(memberId, category),
  });
  return `${appUrl()}/notifications/unsubscribe?${q}`;
}

/** For the List-Unsubscribe header: mail apps POST here for one-click stops. */
export function oneClickUnsubscribeUrl(memberId: string, category: NotifyCategory): string {
  return unsubscribeUrl(memberId, category).replace(
    '/notifications/unsubscribe?',
    '/api/notifications/unsubscribe?',
  );
}

export function verifyUnsubscribe(memberId: string, category: string, sig: string): boolean {
  if (!(category in PREF)) return false;
  return safeEqual(unsubscribeSig(memberId, category as NotifyCategory), sig);
}

export function setNotifyPref(
  householdId: string,
  memberId: string,
  prefs: Partial<Record<NotifyCategory, boolean>>,
  db: Db = getDb(),
): void {
  const values = Object.fromEntries(
    Object.entries(prefs).map(([k, v]) => [PREF[k as NotifyCategory], v]),
  );
  if (!Object.keys(values).length) return;
  db.update(member)
    .set(values)
    .where(and(eq(member.householdId, householdId), eq(member.id, memberId)))
    .run();
}

// ─── Sending ─────────────────────────────────────────────────────────────────

/** Where a member's email goes: their sign-in address. Not-yet-joined members get none. */
function emailOf(m: Member, db: Db): string | null {
  if (!m.accountId) return null;
  return (
    db.select({ email: account.email }).from(account).where(eq(account.id, m.accountId)).get()
      ?.email ?? null
  );
}

/**
 * Send once per (member, kind, ref): the log row is claimed first, so two
 * timers can't both send, and released if sending fails so it's retried.
 */
async function sendOnce(
  hh: Household,
  m: Member,
  category: NotifyCategory,
  kind: string,
  refId: string,
  build: () => { subject: string; blocks: EmailBlock[] },
  db: Db,
): Promise<boolean> {
  if (hh.isDemo || !m[PREF[category]]) return false;
  const to = emailOf(m, db);
  if (!to) return false;
  const id = ulid();
  const claimed = db
    .insert(notificationLog)
    .values({
      id,
      householdId: hh.id,
      memberId: m.id,
      kind,
      refId,
      sentAt: new Date().toISOString(),
    })
    .onConflictDoNothing()
    .run().changes;
  if (!claimed) return false;
  const { subject, blocks } = build();
  const stop = unsubscribeUrl(m.id, category);
  const email = composeEmail({
    to,
    subject,
    blocks,
    footer: t('footer', { household: hh.name, category: t(`categories.${category}`), url: stop }),
  });
  const res = await sendEmail({
    ...email,
    headers: {
      'List-Unsubscribe': `<${oneClickUnsubscribeUrl(m.id, category)}>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    },
  });
  if (!res.sent) {
    db.delete(notificationLog).where(eq(notificationLog.id, id)).run();
    console.warn(`[notify] ${kind} to member ${m.id} failed: ${res.reason}`);
    return false;
  }
  return true;
}

function fmt(hh: Household) {
  return {
    money: (minor: number, currency: string) => formatMoney(minor, currency, hh.locale),
    day: (iso: string) => formatDate(`${iso}T00:00:00Z`, hh.locale, 'UTC', 'medium'),
  };
}

const billLink = (b: { id: string }) => ({
  button: { label: t('open'), href: `${appUrl()}/bills/${b.id}` },
});

function payDetails(payer: Member | null): string {
  return (payer?.paymentDetails ?? []).map((d) => `${d.label} ${d.value}`).join(' · ');
}

/**
 * A bill was added: tell each member with a share what they owe and how to pay,
 * and the payer what's due to the provider. `except` skips whoever entered it.
 */
export async function notifyBillCreated(
  householdId: string,
  billId: string,
  opts: { except?: string | null; db?: Db } = {},
): Promise<number> {
  const db = opts.db ?? getDb();
  const hh = getHousehold(householdId, db);
  const b = getBill(householdId, billId, db);
  if (!hh || !b) return 0;
  const f = fmt(hh);
  const amount = f.money(b.amountMinor, b.currency);
  const due = f.day(b.dueDate);
  const vars = {
    service: b.service.name,
    provider: b.service.provider,
    amount,
    due,
    period: `${f.day(b.periodStart)} – ${f.day(b.periodEnd)}`,
  };
  const payer = b.service.payerMemberId
    ? getMember(householdId, b.service.payerMemberId, db)
    : null;
  let sent = 0;
  const recipients: { m: Member; build: () => { subject: string; blocks: EmailBlock[] } }[] = [];
  if (b.shares.length) {
    const owed = b.shares
      .filter((s) => s.paidMethod !== 'payer')
      .reduce((sum, s) => sum + s.amountMinor, 0);
    for (const s of b.shares) {
      const shareStr = f.money(s.amountMinor, s.currency);
      if (s.paidMethod === 'payer') {
        recipients.push({
          m: s.member,
          build: () => ({
            subject: t('newBill.subjectPayer', vars),
            blocks: [
              { p: t('newBill.intro', vars) },
              { p: t('newBill.payer', { ...vars, owed: f.money(owed, b.currency) }) },
              billLink(b),
            ],
          }),
        });
        continue;
      }
      recipients.push({
        m: s.member,
        build: () => ({
          subject: t('newBill.subject', { ...vars, share: shareStr }),
          blocks: [
            { p: t('newBill.intro', vars) },
            {
              p: payer
                ? t('newBill.share', { share: shareStr, payer: payer.name, due })
                : t('newBill.shareNoPayer', { share: shareStr, due }),
            },
            ...(s.paymentReference
              ? [{ p: t('newBill.reference', { reference: s.paymentReference }) }]
              : []),
            ...(payer && payDetails(payer)
              ? [{ p: t('newBill.payDetails', { payer: payer.name, details: payDetails(payer) }) }]
              : []),
            billLink(b),
          ],
        }),
      });
    }
  } else {
    for (const m of listMembers(householdId, db))
      recipients.push({
        m,
        build: () => ({
          subject: t('newBill.subjectNoShare', vars),
          blocks: [{ p: t('newBill.intro', vars) }, { p: t('newBill.total', vars) }, billLink(b)],
        }),
      });
  }
  for (const r of recipients) {
    if (r.m.id === opts.except) continue;
    if (await sendOnce(hh, r.m, 'bills', 'new_bill', b.id, r.build, db)) sent++;
  }
  return sent;
}

/** A provider said a payment failed or a bill is overdue: tell the admins and the payer. */
export async function notifyBillAlert(
  householdId: string,
  billId: string,
  opts: { db?: Db } = {},
): Promise<number> {
  const db = opts.db ?? getDb();
  const hh = getHousehold(householdId, db);
  const b = getBill(householdId, billId, db);
  if (!hh || !b?.alertKind) return 0;
  const f = fmt(hh);
  const kind = b.alertKind;
  const vars = {
    service: b.service.name,
    provider: b.service.provider,
    amount: f.money(b.amountMinor, b.currency),
    due: f.day(b.dueDate),
  };
  const members = listMembers(householdId, db).filter(
    (m) => m.role === 'owner' || m.id === b.service.payerMemberId,
  );
  let sent = 0;
  for (const m of members) {
    const ok = await sendOnce(
      hh,
      m,
      'problems',
      `alert:${kind}`,
      `${b.id}:${b.alertAt}`,
      () => ({
        subject: t(`alert.subject_${kind}`, vars),
        blocks: [{ p: t(`alert.intro_${kind}`, vars) }, billLink(b)],
      }),
      db,
    );
    if (ok) sent++;
  }
  return sent;
}

function localHour(timeZone: string, now: Date): number {
  return Number(
    new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hour12: false, timeZone }).format(now),
  );
}

/**
 * Due-date reminders for every household, at most once each: shares due within
 * REMIND_DAYS_BEFORE days, overdue shares (first day, then weekly), and the payer
 * when a bill due to the provider within two days isn't marked paid. Bills
 * overdue by more than four weeks are left alone (no flood after an upgrade).
 */
export async function sendDueReminders(now = new Date(), db: Db = getDb()): Promise<number> {
  let sent = 0;
  for (const hh of listHouseholds(db)) {
    if (hh.isDemo) continue;
    const hour = localHour(hh.timezone, now);
    if (hour < QUIET_START || hour >= QUIET_END) continue;
    const today = todayIn(hh.timezone, now);
    const from = addDays(today, -(7 * OVERDUE_REMINDERS + 7));
    const to = addDays(today, REMIND_DAYS_BEFORE);
    const f = fmt(hh);
    const members = new Map(listMembers(hh.id, db).map((m) => [m.id, m]));

    const unpaid = db
      .select({ s: share, b: bill, svc: service })
      .from(share)
      .innerJoin(bill, eq(share.billId, bill.id))
      .innerJoin(service, eq(bill.serviceId, service.id))
      .where(
        and(
          eq(share.householdId, hh.id),
          isNull(share.paidAt),
          gte(bill.dueDate, from),
          lte(bill.dueDate, to),
        ),
      )
      .all();
    for (const { s, b, svc } of unpaid) {
      const m = members.get(s.memberId);
      if (!m) continue;
      const days = daysUntil(today, b.dueDate);
      const payer = svc.payerMemberId ? (members.get(svc.payerMemberId) ?? null) : null;
      const shareStr = f.money(s.amountMinor, s.currency);
      let kind: string;
      let build: () => { subject: string; blocks: EmailBlock[] };
      if (days >= 0) {
        const when = days === 0 ? t('due.today') : t('due.inDays', { days });
        kind = 'share_due';
        build = () => ({
          subject: t('due.subject', { service: svc.name, share: shareStr, when }),
          blocks: [
            {
              p: payer
                ? t('due.intro', { service: svc.name, share: shareStr, when, payer: payer.name })
                : t('due.introNoPayer', { service: svc.name, share: shareStr, when }),
            },
            ...(s.paymentReference
              ? [{ p: t('newBill.reference', { reference: s.paymentReference }) }]
              : []),
            ...(payer && payDetails(payer)
              ? [{ p: t('newBill.payDetails', { payer: payer.name, details: payDetails(payer) }) }]
              : []),
            billLink(b),
          ],
        });
      } else {
        const round = Math.floor((-days - 1) / 7);
        if (round >= OVERDUE_REMINDERS) continue;
        kind = `share_overdue:${round}`;
        const due = f.day(b.dueDate);
        build = () => ({
          subject: t('overdue.subject', { service: svc.name, share: shareStr }),
          blocks: [
            {
              p: payer
                ? t('overdue.intro', { service: svc.name, share: shareStr, due, payer: payer.name })
                : t('overdue.introNoPayer', { service: svc.name, share: shareStr, due }),
            },
            billLink(b),
          ],
        });
      }
      if (await sendOnce(hh, m, 'reminders', kind, s.id, build, db)) sent++;
    }

    const toProvider = db
      .select({ b: bill, svc: service })
      .from(bill)
      .innerJoin(service, eq(bill.serviceId, service.id))
      .where(
        and(
          eq(bill.householdId, hh.id),
          isNull(bill.paidToProviderAt),
          // Paid automatically: nothing for the payer to remember.
          eq(service.autoPay, false),
          gte(bill.dueDate, today),
          lte(bill.dueDate, addDays(today, 2)),
        ),
      )
      .all();
    for (const { b, svc } of toProvider) {
      const payer = svc.payerMemberId ? members.get(svc.payerMemberId) : undefined;
      if (!payer) continue;
      const vars = {
        service: svc.name,
        provider: svc.provider,
        amount: f.money(b.amountMinor, b.currency),
        due: f.day(b.dueDate),
      };
      const ok = await sendOnce(
        hh,
        payer,
        'reminders',
        'provider_due',
        b.id,
        () => ({
          subject: t('providerDue.subject', vars),
          blocks: [{ p: t('providerDue.intro', vars) }, billLink(b)],
        }),
        db,
      );
      if (ok) sent++;
    }
  }
  return sent;
}

/** Fire-and-forget wrapper for request handlers: a failed email never fails the action. */
export function notifyInBackground(p: Promise<unknown>): void {
  p.catch((e) => console.error('[notify]', (e as Error).message));
}
