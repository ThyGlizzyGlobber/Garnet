import { and, eq, isNotNull } from 'drizzle-orm';
import { simpleParser, type ParsedMail } from 'mailparser';
import { getDb, type Db } from '@/db/client';
import { emailForward, type EmailForward, type ForwardMode } from '@/db/schema';
import { normaliseEmail, randomToken, sha256 } from '@/lib/auth/tokens';
import { escapeHtml, sendEmail, type OutgoingEmail, type SendResult } from '@/lib/email';
import { getEnv } from '@/lib/env';
import { rateLimit } from '@/lib/rate-limit';

/**
 * Members can have mail sent to the household's bills address copied to their
 * own inbox — password resets and account notices from providers, and bills.
 * The app re-sends it from its own domain (Cloudflare can only forward to
 * addresses verified by hand), with Reply-To set to the original sender.
 */

export const FORWARD_HEADER = 'X-Home-Utilities-Forwarded';
export const CONFIRM_TTL_MS = 3 * 86_400_000;
/** Resend accepts up to 40 MB per email; leave room for base64 and the body. */
const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;

export function getForward(householdId: string, memberId: string, db: Db = getDb()) {
  return (
    db
      .select()
      .from(emailForward)
      .where(and(eq(emailForward.householdId, householdId), eq(emailForward.memberId, memberId)))
      .get() ?? null
  );
}

/**
 * Turn forwarding on or change it. The member's own sign-in email is already
 * proven, so it's active at once; any other address gets a confirmation link
 * (returned as `token`) and receives nothing until it's confirmed.
 */
export function setForward(
  householdId: string,
  memberId: string,
  input: { email: string; mode: ForwardMode; accountEmail: string | null },
  db: Db = getDb(),
  now = Date.now(),
): { forward: EmailForward; token: string | null } {
  const email = normaliseEmail(input.email);
  const iso = new Date(now).toISOString();
  const existing = getForward(householdId, memberId, db);
  const trusted =
    email === input.accountEmail || (existing?.email === email && existing.verifiedAt !== null);
  const token = trusted ? null : randomToken();
  const values = {
    email,
    mode: input.mode,
    verifiedAt: trusted ? (existing?.email === email ? existing.verifiedAt : iso) : null,
    tokenHash: token ? sha256(token) : null,
    tokenExpiresAt: token ? new Date(now + CONFIRM_TTL_MS).toISOString() : null,
    updatedAt: iso,
  };
  db.insert(emailForward)
    .values({ memberId, householdId, createdAt: iso, ...values })
    .onConflictDoUpdate({ target: emailForward.memberId, set: values })
    .run();
  return { forward: getForward(householdId, memberId, db)!, token };
}

export function disableForward(householdId: string, memberId: string, db: Db = getDb()): void {
  db.delete(emailForward)
    .where(and(eq(emailForward.householdId, householdId), eq(emailForward.memberId, memberId)))
    .run();
}

/** The pending forward a confirmation link points at, if it's still valid. */
export function pendingForwardByToken(token: string, db: Db = getDb(), now = Date.now()) {
  if (!token) return null;
  const row = db
    .select()
    .from(emailForward)
    .where(eq(emailForward.tokenHash, sha256(token)))
    .get();
  return row?.tokenExpiresAt && Date.parse(row.tokenExpiresAt) > now ? row : null;
}

/** Confirm an address from the emailed link. Returns the confirmed row, or null. */
export function confirmForward(token: string, db: Db = getDb(), now = Date.now()) {
  if (!token) return null;
  const row = db
    .select()
    .from(emailForward)
    .where(eq(emailForward.tokenHash, sha256(token)))
    .get();
  if (!row || !row.tokenExpiresAt || Date.parse(row.tokenExpiresAt) <= now) return null;
  db.update(emailForward)
    .set({
      verifiedAt: new Date(now).toISOString(),
      tokenHash: null,
      tokenExpiresAt: null,
      updatedAt: new Date(now).toISOString(),
    })
    .where(eq(emailForward.memberId, row.memberId))
    .run();
  return { ...row, verifiedAt: new Date(now).toISOString() };
}

export function activeForwards(householdId: string, db: Db = getDb()): EmailForward[] {
  return db
    .select()
    .from(emailForward)
    .where(and(eq(emailForward.householdId, householdId), isNotNull(emailForward.verifiedAt)))
    .all();
}

/** Mail we forwarded coming back (e.g. a Gmail auto-forward pointed at the bills address). */
export function isOurForward(mail: ParsedMail): boolean {
  if (mail.headers.has(FORWARD_HEADER.toLowerCase())) return true;
  const ours = /<([^>]+)>/.exec(getEnv().EMAIL_FROM)?.[1] ?? getEnv().EMAIL_FROM;
  return (mail.from?.value ?? []).some((a) => a.address?.toLowerCase() === ours.toLowerCase());
}

/** The copy that goes to a member: original content, a short banner, attachments, Reply-To. */
export function composeForward(
  mail: ParsedMail,
  opts: { to: string; billsAddress: string; banner: string },
): OutgoingEmail {
  const subject = mail.subject ? `Fwd: ${mail.subject}` : 'Fwd: (no subject)';
  const text = `${opts.banner}\n\n${mail.text ?? ''}`.trim();
  const original =
    typeof mail.html === 'string' && mail.html
      ? mail.html
      : `<pre style="white-space:pre-wrap;font:14px/1.5 -apple-system,sans-serif">${escapeHtml(mail.text ?? '')}</pre>`;
  const html = `<div style="margin:0 0 16px;padding:10px 14px;border-radius:10px;background:#eef1f5;color:#3a4a63;font:13px/1.4 -apple-system,Segoe UI,Roboto,sans-serif">${escapeHtml(opts.banner)}</div>${original}`;
  let budget = MAX_ATTACHMENT_BYTES;
  const attachments = (mail.attachments ?? [])
    .filter((a) => {
      if (a.size > budget) return false;
      budget -= a.size;
      return true;
    })
    .map((a) => ({
      filename: a.filename ?? 'attachment',
      content: a.content,
      contentType: a.contentType,
    }));
  return {
    to: opts.to,
    subject,
    text,
    html,
    ...(mail.from?.value[0]?.address ? { replyTo: mail.from.value[0].address } : {}),
    headers: { [FORWARD_HEADER]: opts.billsAddress },
    attachments,
  };
}

/**
 * Copy one inbound message to every member who asked for it. `readAsBill`
 * decides the "only emails that aren't bills" mode (undefined = not known yet).
 */
export async function forwardInbound(
  householdId: string,
  source: Buffer,
  opts: {
    billsAddress: string;
    readAsBill: boolean;
    banner: (sender: string) => string;
    db?: Db;
  },
): Promise<{ to: string; result: SendResult }[]> {
  const db = opts.db ?? getDb();
  const targets = activeForwards(householdId, db).filter(
    (f) => f.mode === 'all' || (f.mode === 'non_bills' && !opts.readAsBill),
  );
  if (!targets.length) return [];
  const mail = await simpleParser(source);
  if (isOurForward(mail)) return [];
  const out: { to: string; result: SendResult }[] = [];
  for (const f of targets) {
    if (!rateLimit(`forward:${f.memberId}`, 60, 3_600_000)) continue;
    const result = await sendEmail(
      composeForward(mail, {
        to: f.email,
        billsAddress: opts.billsAddress,
        banner: opts.banner(mail.from?.text ?? ''),
      }),
    );
    if (!result.sent) console.warn(`[forward] to member ${f.memberId} failed: ${result.reason}`);
    out.push({ to: f.email, result });
  }
  return out;
}
