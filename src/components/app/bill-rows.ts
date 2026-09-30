import type { BillListItem } from '@/lib/bills';
import { billDue, type BillStatus } from '@/lib/bill-status';
import type { BillFile } from '@/lib/bill-files';
import type { BillRowModel, DocRowModel, FileRowModel } from '@/components/ui/rows';
import type { ReviewItem } from '@/lib/review';
import { paysByInstalments } from '@/lib/instalments';
import { unitLabel } from '@/lib/units';
import { formatDayRange, formatPeriod } from '@/lib/format';

/**
 * The one bill row and the one document row, worded: these turn a bill (or a
 * document) into the small model of strings the rows draw (BRAND.md §7), so
 * every list says the same things in the same words. `t` is the `ui`
 * translator; the numbers come from src/lib.
 */
type T = (key: string, values?: Record<string, string | number>) => string;

export interface RowCtx {
  t: T;
  today: string;
  locale: string;
  money: (minor: number, currency?: string) => string;
  /** "8 Sep" */
  date: (iso: string) => string;
  /** "8 Sep", or "8 Sep 2027" when it isn't this year. */
  dateYear: (iso: string) => string;
  /** The viewer, for "You $215.80" and "Yours". */
  viewerId: string;
}

/** "Paid", "3 days overdue", "Due today", "Due in 4 days", "Due 12 Oct". */
export function statusLabel(c: Pick<RowCtx, 't' | 'dateYear'>, s: BillStatus): string {
  return c.t(`status.${s.key}`, { n: Math.abs(s.days), date: c.dateYear(s.dueDate) });
}

/** The same, mid-sentence: "…, due 12 Oct". */
export const lowerFirst = (s: string): string => s.charAt(0).toLowerCase() + s.slice(1);

/** "Today", "Tomorrow", "In 3 days", "5 days overdue", or the date. */
export function relativeDay(
  c: Pick<RowCtx, 't' | 'dateYear' | 'today'>,
  days: number,
  ymd: string,
) {
  if (days === 0) return c.t('rel.today');
  if (days === 1) return c.t('rel.tomorrow');
  if (days < 0) return c.t('rel.overdue', { n: -days });
  if (days <= 7) return c.t('rel.inDays', { n: days });
  return c.dateYear(ymd);
}

const range = (b: BillListItem, locale: string) => formatPeriod(b.periodStart, b.periodEnd, locale);

const usageText = (b: BillListItem, c: RowCtx) =>
  b.usageQuantity !== null && b.usageQuantity > 0
    ? `${new Intl.NumberFormat(c.locale, { maximumFractionDigits: 1 }).format(b.usageQuantity)} ${unitLabel(b.usageUnit ?? b.service.usageUnit)}`
    : null;

/** The instalment dots: paid ones, the next one, the rest. */
function instalmentStates(b: BillListItem): BillRowModel['instalments'] {
  if (!paysByInstalments(b)) return undefined;
  const next = b.instalments.find((i) => !i.paidToProviderAt)?.seq;
  return b.instalments.map((i) =>
    i.paidToProviderAt ? 'done' : i.seq === next ? 'next' : 'later',
  );
}

export function billRowFor(
  b: BillListItem,
  c: RowCtx,
  o: { inService?: boolean; share?: boolean; noDisc?: boolean } = {},
): BillRowModel {
  const due = billDue(b, c.today);
  const byInstalments = paysByInstalments(b);
  const personal = !!b.ownerMemberId;
  // Under its service, a bill is its period; elsewhere it is the service.
  const title = o.inService
    ? byInstalments
      ? c.t('row.notice', { from: b.periodStart.slice(0, 4), to: b.periodEnd.slice(2, 4) })
      : range(b, c.locale)
    : b.service.name;
  let sub: string;
  if (byInstalments) {
    const paid = b.instalments.every((i) => i.paidToProviderAt);
    sub = paid
      ? c.t('row.paidInstalments', { of: b.instalments.length, range: range(b, c.locale) })
      : c.t('row.instalment', {
          n: due.instalment?.n ?? 1,
          of: due.instalment?.of ?? b.instalments.length,
          amount: c.money(b.amountMinor, b.currency),
        });
  } else {
    const usage = usageText(b, c);
    const first = o.inService
      ? b.issueDate
        ? c.t('row.issued', { date: c.date(b.issueDate) })
        : formatDayRange(b.periodStart, b.periodEnd, c.locale)
      : range(b, c.locale);
    sub = usage ? `${first} · ${usage}` : first;
  }
  const mine = b.shares.find(
    (s) => s.memberId === c.viewerId && s.instalment === (due.instalment?.n ?? 0),
  );
  const tags: BillRowModel['tags'] = [];
  if (b.isAnomaly) tags.push({ label: c.t('row.unusual'), tone: 'warn', icon: 'trend-up' });
  if (personal) tags.push({ label: c.t('row.yours'), tone: 'info', icon: 'user' });
  if (b.alertKind)
    tags.push({ label: c.t(`row.alert.${b.alertKind}`), tone: 'bad', icon: 'alert' });
  return {
    href: `/bills/${b.id}`,
    title,
    provider: o.inService ? undefined : b.service.provider,
    sub,
    amount: c.money(due.amountMinor, b.currency),
    status: { label: statusLabel(c, due.status), tone: due.status.tone },
    share:
      o.share && mine && !personal
        ? c.t('row.you', { amount: c.money(mine.amountMinor, b.currency) })
        : undefined,
    tags: tags.length ? tags : undefined,
    instalments: instalmentStates(b),
    disc: o.noDisc ? undefined : { icon: b.service.type.icon, colour: b.service.colour },
    colour: b.service.colour,
  };
}

/** How a document arrived, in words: "Uploaded by Alex", "Forwarded by Jordan", "Emailed in". */
function arrivalText(c: Pick<RowCtx, 't'>, a: BillFile['arrival']): string {
  if (a.kind === 'upload')
    return a.name ? c.t('how.uploadedBy', { name: a.name }) : c.t('how.upload');
  if (a.kind === 'forward') return c.t('how.forward', { name: a.name });
  return c.t('how.email');
}

/** The file type a document row draws: what it opens as. */
const docType = (view: BillFile['view']): DocRowModel['type'] =>
  view === 'photo' ? 'photo' : view === 'email' ? 'email' : 'pdf';

/** A document's state in the only three words a document gets. */
function docState(d: Pick<ReviewItem, 'status' | 'extraction'>): DocRowModel['state'] {
  if (d.status === 'unprocessed') return 'waiting';
  if (d.status === 'needs_review' && !d.extraction?.result) return 'failed';
  return 'analysed';
}

/** How many of a document's bill details are missing, for "N details to confirm". */
function detailsToConfirm(d: Pick<ReviewItem, 'status' | 'extraction'>): number | null {
  if (d.status !== 'needs_review') return null;
  const r = d.extraction?.result?.bill;
  if (!r) return null;
  const missing = [r.amountMinor > 0, !!r.periodStart, !!r.periodEnd, !!r.dueDate].filter(
    (ok) => !ok,
  ).length;
  return Math.max(1, missing);
}

export function docRowFor(
  d: ReviewItem,
  c: RowCtx & { arrival: BillFile['arrival']; view: BillFile['view'] },
  o: { bill?: { serviceName: string; amount: string } | null; needsPlain?: boolean } = {},
): DocRowModel {
  const r = d.extraction?.result;
  const kindWord =
    d.category === 'bill'
      ? c.t('doc.kind.bill')
      : d.category === 'receipt'
        ? c.t('doc.kind.receipt')
        : d.status === 'notice'
          ? c.t('doc.kind.notice')
          : d.kind === 'upload'
            ? c.t('doc.kind.document')
            : c.t('doc.kind.email');
  // "Northwind Energy bill", "Hearthline Gas receipt": the provider and what it is.
  const title = r?.bill.provider
    ? `${r.bill.provider} ${(d.status === 'needs_review' ? c.t('doc.kind.bill') : kindWord).toLowerCase()}`
    : (d.emailSubject ?? d.originalFilename ?? kindWord);
  const needs = detailsToConfirm(d);
  const state = docState(d);
  return {
    href: d.linkedBillId ? `/bills/${d.linkedBillId}` : `/inbox/${d.id}`,
    title,
    sub: `${kindWord} · ${arrivalText(c, c.arrival)} · ${c.date(d.date)}`,
    type: docType(c.view),
    state,
    needs:
      needs !== null && state === 'analysed'
        ? c.t('doc.toConfirm', { count: needs })
        : d.status === 'needs_review' && state === 'failed' && o.needsPlain
          ? c.t('doc.tryAgain')
          : undefined,
    bill: o.bill ? `${o.bill.serviceName} · ${o.bill.amount}` : undefined,
  };
}

export function fileRowFor(f: BillFile, c: RowCtx): FileRowModel {
  const kindWord = c.t(`doc.kind.${f.kind === 'bill' ? 'bill' : f.kind}`);
  return {
    type: docType(f.view),
    name: f.kind === 'bill' ? (f.doc.originalFilename ?? f.doc.emailSubject ?? kindWord) : kindWord,
    sub: `${arrivalText(c, f.arrival)} · ${c.date(f.doc.receivedAt)}`,
    verified: f.doc.senderVerified && f.doc.senderDomain ? f.doc.senderDomain : undefined,
    state: 'analysed',
  };
}

/** The row context for a page: the household's formatting plus the `ui` words. */
export function rowCtx(
  p: {
    hh: { locale: string; currency: string };
    me: { id: string };
    today: string;
    money: (minor: number, currency?: string) => string;
  },
  t: T,
): RowCtx {
  const dm = new Intl.DateTimeFormat(p.hh.locale, {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });
  const dmy = new Intl.DateTimeFormat(p.hh.locale, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
  const at = (iso: string) => new Date(iso.length === 10 ? `${iso}T00:00:00Z` : iso);
  return {
    t,
    today: p.today,
    locale: p.hh.locale,
    money: p.money,
    date: (iso) => dm.format(at(iso)),
    dateYear: (iso) =>
      iso.slice(0, 4) === p.today.slice(0, 4) ? dm.format(at(iso)) : dmy.format(at(iso)),
    viewerId: p.me.id,
  };
}
