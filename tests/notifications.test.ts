import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { openDb, type Db } from '@/db/client';
import { runMigrations } from '@/db/migrate';
import { linkMember, signInAccount } from '@/lib/accounts';
import { createBill, setBillAlert, setSharePaid } from '@/lib/bills';
import { devOutbox } from '@/lib/email';
import { createHousehold } from '@/lib/households';
import { createMember } from '@/lib/members';
import {
  notifyBillAlert,
  notifyBillCreated,
  sendDueReminders,
  setNotifyPref,
  unsubscribeUrl,
  verifyUnsubscribe,
} from '@/lib/notifications';
import { createService, updateService } from '@/lib/services';

let dir: string;
let db: Db;
let close: () => void;

beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hud-notify-'));
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
/** A household with a payer (Jo), a joined member (Sam) and an invited-only member (Kim). */
function setup(opts: { isDemo?: boolean; due?: string; periodStart?: string } = {}) {
  const tag = `h${++n}`;
  const hh = createHousehold(
    {
      name: `Notify ${tag}`,
      currency: 'AUD',
      locale: 'en-AU',
      timezone: 'Australia/Melbourne',
      fiscalYearStartMonth: 7,
      splitMode: 'shared',
      isDemo: opts.isDemo,
    },
    db,
  );
  const person = (name: string, role: 'owner' | 'member', joined: boolean) => {
    const m = createMember(
      hh.id,
      {
        name,
        role,
        activeFrom: '2026-01-01',
        paymentDetails: name === 'Jo' ? [{ label: 'PayID', value: 'jo@payid.example' }] : [],
      },
      db,
    );
    if (joined) {
      const a = signInAccount({ email: `${name.toLowerCase()}.${tag}@example.com` }, db);
      linkMember(m.id, a.id, a.email, db);
    }
    return { ...m, email: `${name.toLowerCase()}.${tag}@example.com` };
  };
  const jo = person('Jo', 'owner', true);
  const sam = person('Sam', 'member', true);
  const kim = person('Kim', 'member', false);
  const svc = createService(
    hh.id,
    { typeSlug: 'internet', name: 'Internet', provider: 'Aussie Broadband', payerMemberId: jo.id },
    db,
  );
  const bill = createBill(
    hh.id,
    {
      serviceId: svc.id,
      amountMinor: 12900,
      periodStart: opts.periodStart ?? '2026-09-14',
      periodEnd: '2026-10-13',
      dueDate: opts.due ?? '2026-10-13',
      source: 'manual',
    },
    db,
  );
  return { hh, jo, sam, kim, svc, bill };
}

const inbox = (to: string) => devOutbox.filter((e) => e.to === to);
/** 10:00 on 10 Oct 2026 in Melbourne (AEDT, UTC+11). */
const TEN_AM = new Date('2026-10-09T23:00:00Z');
const at = (day: string, hourUtc = 23) =>
  new Date(`${day}T${String(hourUtc).padStart(2, '0')}:00:00Z`);

describe('new bill emails', () => {
  it('tell each joined member their share and how to pay, and the payer what they owe the provider', async () => {
    const { hh, jo, sam, kim, bill } = setup();
    expect(await notifyBillCreated(hh.id, bill.id, { db })).toBe(2);
    const [toSam] = inbox(sam.email);
    expect(toSam?.subject).toBe('New Internet bill: your share is $43.00');
    expect(toSam?.text).toContain('Please pay Jo');
    expect(toSam?.text).toContain('PayID jo@payid.example');
    expect(toSam?.text).toMatch(/Payment reference: Internet Sep26 Sam/);
    expect(toSam?.text).toContain(`/bills/${bill.id}`);
    expect(toSam?.headers?.['List-Unsubscribe']).toContain('/api/notifications/unsubscribe?');
    const [toJo] = inbox(jo.email);
    expect(toJo?.subject).toMatch(/^New Internet bill: \$129\.00 due/);
    expect(toJo?.text).toContain('The others owe you $86.00');
    expect(inbox(kim.email)).toHaveLength(0);
    // Never twice.
    expect(await notifyBillCreated(hh.id, bill.id, { db })).toBe(0);
  });

  it('skip whoever entered the bill, anyone who turned them off, and demo households', async () => {
    const a = setup();
    setNotifyPref(a.hh.id, a.sam.id, { bills: false }, db);
    expect(await notifyBillCreated(a.hh.id, a.bill.id, { except: a.jo.id, db })).toBe(0);
    const demo = setup({ isDemo: true });
    expect(await notifyBillCreated(demo.hh.id, demo.bill.id, { db })).toBe(0);
  });
});

describe('usage limits in new bill emails', () => {
  it('say when a bill used more than the household’s limit, per day', async () => {
    const { hh, sam, svc } = setup();
    updateService(hh.id, svc.id, { usageUnit: 'GB', usageLimitMonthly: 300 }, db);
    const over = createBill(
      hh.id,
      {
        serviceId: svc.id,
        amountMinor: 12900,
        periodStart: '2026-10-14',
        periodEnd: '2026-11-13', // 31 days
        dueDate: '2026-11-13',
        usageQuantity: 372, // 12 GB/day vs ≈9.86 allowed
        usageUnit: 'GB',
        source: 'manual',
      },
      db,
    );
    await notifyBillCreated(hh.id, over.id, { db });
    const mail = inbox(sam.email).find((e) => e.text.includes('over your household'));
    expect(mail?.text).toContain("12 GB a day, 22% over your household's limit of 300 GB a month");
  });
});

describe('reminders', () => {
  it('remind a member three days before their share is due, once, in daytime only', async () => {
    const { sam } = setup();
    const night = new Date('2026-10-09T12:00:00Z'); // 23:00 in Melbourne
    await sendDueReminders(night, db);
    expect(inbox(sam.email).filter((e) => e.subject.startsWith('Reminder'))).toHaveLength(0);
    await sendDueReminders(TEN_AM, db);
    await sendDueReminders(TEN_AM, db);
    const reminders = inbox(sam.email).filter((e) => e.subject.startsWith('Reminder'));
    expect(reminders.map((e) => e.subject)).toEqual([
      'Reminder: your Internet share of $43.00 is due in 3 days',
    ]);
  });

  it('chase overdue shares on the first day, then weekly, then stop', async () => {
    const { sam } = setup({ due: '2026-10-01', periodStart: '2026-09-02' });
    const overdue = () => inbox(sam.email).filter((e) => e.subject.startsWith('Overdue')).length;
    await sendDueReminders(at('2026-10-01'), db); // 10:00 on 2 Oct, 1 day late
    await sendDueReminders(at('2026-10-03'), db); // same week
    expect(overdue()).toBe(1);
    await sendDueReminders(at('2026-10-08'), db); // second week
    await sendDueReminders(at('2026-10-15'), db); // third week
    await sendDueReminders(at('2026-10-22'), db); // done
    expect(overdue()).toBe(3);
  });

  it('stop once the share is paid, and ignore long-overdue bills after an upgrade', async () => {
    const a = setup();
    const samShare = a.bill.shares.find((s) => s.memberId === a.sam.id)!;
    setSharePaid(a.hh.id, samShare.id, true, {}, db);
    await sendDueReminders(TEN_AM, db);
    expect(inbox(a.sam.email)).toHaveLength(0);

    const old = setup({ due: '2026-06-01', periodStart: '2026-05-01' });
    await sendDueReminders(TEN_AM, db);
    expect(inbox(old.sam.email)).toHaveLength(0);
  });

  it('remind the payer to pay the provider two days out if it is not marked paid', async () => {
    const { jo } = setup({ due: '2026-10-12' });
    await sendDueReminders(TEN_AM, db);
    expect(inbox(jo.email).map((e) => e.subject)).toContain(
      'Reminder: pay Aussie Broadband $129.00 by 12 Oct 2026',
    );
  });
});

describe('payment problem emails', () => {
  it('go to the admin and the payer, once per alert', async () => {
    const { hh, jo, sam, bill } = setup();
    setBillAlert(hh.id, bill.id, 'payment_failed', null, db);
    expect(await notifyBillAlert(hh.id, bill.id, { db })).toBe(1); // Jo is both admin and payer
    expect(inbox(jo.email).at(-1)?.subject).toBe('Payment failed: Aussie Broadband Internet bill');
    expect(inbox(sam.email)).toHaveLength(0);
    expect(await notifyBillAlert(hh.id, bill.id, { db })).toBe(0);
  });
});

describe('unsubscribe links', () => {
  it('are signed per member and category', () => {
    const { sam } = setup();
    const url = new URL(unsubscribeUrl(sam.id, 'reminders'));
    const m = url.searchParams.get('m') ?? '';
    const c = url.searchParams.get('c') ?? '';
    const t = url.searchParams.get('t') ?? '';
    expect(verifyUnsubscribe(m, c, t)).toBe(true);
    expect(verifyUnsubscribe(m, 'bills', t)).toBe(false);
    expect(verifyUnsubscribe('someone-else', c, t)).toBe(false);
    expect(verifyUnsubscribe(m, 'nonsense', t)).toBe(false);
  });
});
