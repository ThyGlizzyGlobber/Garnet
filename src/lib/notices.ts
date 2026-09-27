/**
 * Provider emails that aren't bills: payment failed, overdue reminders,
 * payment received. Recognised from the subject and the opening text, with
 * conditional sentences ("If your payment fails, a fee applies") ignored —
 * every bill has those.
 */
export type NoticeKind = 'payment_failed' | 'overdue' | 'payment_received';

const FAILED = [
  /\b(payment|direct debit|card payment|transaction|autopay|auto-pay)\b[^.!?\n]{0,40}\b(failed|unsuccessful|declined|dishono(u)?red|rejected|bounced|could not be (processed|completed)|was not (processed|completed))\b/i,
  /\b(unable|couldn'?t|could not|were unable) to (process|collect|take|complete) (your |the )?(payment|direct debit)/i,
  /\b(failed|declined|dishono(u)?red|unsuccessful|rejected) (payment|direct debit|transaction)\b/i,
];
const OVERDUE = [
  /\b(overdue|past due|final notice|reminder notice|payment reminder|disconnection (notice|warning)|suspension (notice|warning)|in arrears)\b/i,
  /\b(has not been paid|remains unpaid|is now due and unpaid|still outstanding)\b/i,
];
/** Subject lines can be terse ("Payment received"); body text must be a real sentence. */
const RECEIVED_SUBJECT = [
  /\b(payment (has been )?(received|successful|processed|confirmed|complete))\b/i,
  /\bthank(s| you) for (your )?payment\b/i,
  /\b(payment (receipt|confirmation)|receipt for your payment)\b/i,
];
const RECEIVED_BODY = [
  /\bthank(s| you) for (your )?payment\b/i,
  /\bwe('ve| have) (now )?received your payment\b/i,
  /\byour payment (of [^.!?]{1,20} )?(has been|was) (received|processed|successful)\b/i,
];

function sentences(text: string): string[] {
  return text
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+|\n/)
    .filter((s) => !/\b(if|should|in case|unless|may be charged|fee (for|applies))\b/i.test(s));
}

function hit(patterns: RegExp[], parts: string[]): boolean {
  return parts.some((p) => patterns.some((re) => re.test(p)));
}

/**
 * From the subject alone — a strong signal, used before any bill reading
 * ("Your invoice" never matches; "Payment unsuccessful" does).
 */
export function classifySubject(subject: string | null): NoticeKind | null {
  const parts = subject ? [subject] : [];
  if (hit(FAILED, parts)) return 'payment_failed';
  if (hit(OVERDUE, parts)) return 'overdue';
  if (hit(RECEIVED_SUBJECT, parts)) return 'payment_received';
  return null;
}

/**
 * From subject and opening text — only used once no bill could be read, since
 * invoices carry table headings like "Payment Received" and "Overdue".
 */
export function classifyNotice(subject: string | null, text: string): NoticeKind | null {
  const fromSubject = classifySubject(subject);
  if (fromSubject) return fromSubject;
  const parts = sentences(text.slice(0, 2000)).filter((p) => p.split(' ').length >= 5);
  if (hit(FAILED, parts)) return 'payment_failed';
  if (hit(OVERDUE, parts)) return 'overdue';
  if (hit(RECEIVED_BODY, parts)) return 'payment_received';
  return null;
}

/**
 * Does an unread email still look like a bill? Then it goes to review rather
 * than being filed as a notice, so an unreadable bill is never quietly lost.
 */
export function looksLikeBill(subject: string | null, text: string): boolean {
  const all = `${subject ?? ''}\n${text.slice(0, 4000)}`;
  const money = /(\$|€|£|¥|\b(AUD|USD|EUR|GBP|NZD|CAD)\b)\s?\d/i.test(all);
  const billWords =
    /\b(amount (due|owing|payable)|total (due|amount|payable)|balance (due|owing)|due date|pay by|tax invoice|invoice|your (new )?bill|statement)\b/i.test(
      all,
    );
  return money && billWords;
}
