import { eq, inArray } from 'drizzle-orm';
import { getDb, type Db } from '@/db/client';
import { member, share } from '@/db/schema';
import fs from 'node:fs';
import { documentPath, readDocument } from '@/ingest/archive';
import { billDate } from '@/lib/bill-month';
import { dayIn } from '@/lib/dates';
import { listBills } from '@/lib/bills';
import { filedDocuments, safeSegment, uniquePaths } from '@/lib/filing';
import { formatMinorPlain, formatMoney } from '@/lib/format';
import { getHousehold } from '@/lib/households';
import { fiscalYearBounds } from '@/lib/periods';
import { memberLedger } from '@/lib/stats';
import type { Scope } from '@/lib/scope';
import type { ZipEntry } from '@/lib/zip';
import { isAdmin } from '@/lib/roles';

/**
 * Whose bills a member's export holds: admins, and every member when the
 * household allows it (Settings), get the household's bills plus their own
 * personal ones; otherwise a member gets just their own personal bills.
 * Another member's personal bills are never in anyone's export.
 */
export function exportScope(
  me: { id: string; role: string },
  hh: { membersCanExport: boolean },
): Scope {
  return isAdmin(me) || hh.membersCanExport ? { viewer: me.id } : { owner: me.id };
}

/** May this member download the household's bills (not just their own)? */
export const canExportHousehold = (
  me: { role: string },
  hh: { membersCanExport: boolean },
): boolean => isAdmin(me) || hh.membersCanExport;

/**
 * One CSV cell. Text that a spreadsheet would run as a formula (starting with
 * = + - @ or a tab/return, e.g. a service name or an invoice number read off a
 * document) gets a leading apostrophe; plain numbers like "-12.50" don't.
 */
function csvCell(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return '';
  let s = String(v);
  if (typeof v === 'string' && /^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** CSV with quoting where needed, safe to open in a spreadsheet. */
export function csv(rows: (string | number | null | undefined)[][]): string {
  return rows.map((r) => r.map(csvCell).join(',')).join('\n') + '\n';
}

/**
 * Everything an accountant needs, as one zip: a README, spreadsheets of the
 * bills, instalments, shares and files, and every bill's source file (PDF,
 * photo or email) with its receipts and payment notices, filed by year, then
 * month, then service (see src/lib/filing.ts: the same tree as on the NAS).
 *
 *   Smith Household bills 2026-09-29/
 *     README.txt, bills.csv, files.csv, instalments.csv, shares.csv
 *     2026/08 August/Council rates/2026-08-11 Council rates - City of Greater Bendigo.pdf
 *
 * The scope says whose bills: an admin exports the household's plus their
 * own personal bills; any member can export just their personal bills.
 */
export function exportEntries(
  householdId: string,
  scope: Scope,
  today: string,
  db: Db = getDb(),
): { folder: string; entries: ZipEntry[] } {
  const hh = getHousehold(householdId, db)!;
  const folder = safeSegment(`${hh.name} bills ${today}`);
  const bills = listBills(householdId, scope, db).sort(
    (a, b) =>
      billDate(a).localeCompare(billDate(b)) || a.service.name.localeCompare(b.service.name),
  );
  const ids = new Set(bills.map((b) => b.id));
  const members = new Map(
    db
      .select()
      .from(member)
      .where(eq(member.householdId, householdId))
      .all()
      .map((m) => [m.id, m.name]),
  );
  const filed = filedDocuments(householdId, scope, db).filter((f) => ids.has(f.billId));
  // A file that has gone missing on disk is listed in the README, not left to break the zip.
  const files = filed.filter((f) => fs.existsSync(documentPath(f.doc)));
  const missing = filed.filter((f) => !files.includes(f));
  const paths = uniquePaths(files);
  const filesByBill = new Map<string, string[]>();
  for (const f of files)
    filesByBill.set(f.billId, [...(filesByBill.get(f.billId) ?? []), paths.get(f.doc.id)!]);
  const money = (minor: number | null, currency: string) =>
    minor === null ? '' : formatMinorPlain(minor, currency);
  const whose = (ownerId: string | null) =>
    ownerId ? `Personal (${members.get(ownerId) ?? 'member'})` : 'Household';

  const billsCsv = csv([
    [
      'month',
      'belongs_to',
      'service',
      'type',
      'business',
      'vehicle_or_policy',
      'invoice',
      'issue_date',
      'period_start',
      'period_end',
      'due_date',
      'amount',
      'tax',
      'tax_label',
      'currency',
      'payment_plan',
      'paid_to_business_on',
      'usage',
      'unit',
      'flag',
      'entered',
      'notes',
      'files',
    ],
    ...bills.map((b) => [
      billDate(b).slice(0, 7),
      whose(b.ownerMemberId),
      b.service.name,
      b.service.type.label,
      b.service.provider,
      b.asset?.name,
      b.externalRef,
      b.issueDate,
      b.periodStart,
      b.periodEnd,
      b.dueDate,
      money(b.amountMinor, b.currency),
      money(b.taxMinor, b.currency),
      b.taxLabel,
      b.currency,
      b.instalments.length ? (b.paymentPlan ?? 'full (not chosen)') : '',
      b.paidToProviderAt?.slice(0, 10),
      b.usageQuantity,
      b.usageUnit,
      b.isAnomaly ? 'unusual' : '',
      b.source === 'manual' ? 'by hand' : 'read from file',
      b.notes,
      (filesByBill.get(b.id) ?? []).join(' | '),
    ]),
  ]);

  const byBill = new Map(bills.map((b) => [b.id, b]));
  const filesCsv = csv([
    [
      'file',
      'kind',
      'service',
      'business',
      'bill_month',
      'belongs_to',
      'received',
      'original_name',
    ],
    ...files.map((f) => {
      const b = byBill.get(f.billId)!;
      return [
        paths.get(f.doc.id),
        f.kind,
        b.service.name,
        b.service.provider,
        billDate(b).slice(0, 7),
        whose(b.ownerMemberId),
        dayIn(f.doc.receivedAt, hh.timezone),
        f.doc.originalFilename ?? f.doc.emailSubject,
      ];
    }),
  ]);

  const withInstalments = bills.filter((b) => b.instalments.length);
  const instalmentsCsv = csv([
    [
      'service',
      'business',
      'invoice',
      'chosen',
      'instalment',
      'due_date',
      'amount',
      'currency',
      'paid_to_business_on',
    ],
    ...withInstalments.flatMap((b) =>
      b.instalments.map((i) => [
        b.service.name,
        b.service.provider,
        b.externalRef,
        b.paymentPlan === 'instalments' ? 'yes' : 'no',
        `${i.seq} of ${b.instalments.length}`,
        i.dueDate,
        money(i.amountMinor, b.currency),
        b.currency,
        i.paidToProviderAt?.slice(0, 10),
      ]),
    ),
  ]);

  const shares = ids.size
    ? db
        .select()
        .from(share)
        .where(inArray(share.billId, [...ids]))
        .all()
    : [];
  const sharesCsv = csv([
    [
      'month',
      'service',
      'business',
      'member',
      'instalment',
      'due_date',
      'share',
      'currency',
      'paid_on',
      'how',
      'reference',
    ],
    ...shares
      .map((s) => ({ s, b: byBill.get(s.billId)! }))
      .sort(
        (x, y) =>
          billDate(x.b).localeCompare(billDate(y.b)) ||
          x.b.service.name.localeCompare(y.b.service.name) ||
          x.s.instalment - y.s.instalment,
      )
      .map(({ s, b }) => [
        billDate(b).slice(0, 7),
        b.service.name,
        b.service.provider,
        members.get(s.memberId),
        s.instalment || '',
        s.dueDate ?? b.dueDate,
        money(s.amountMinor, s.currency),
        s.currency,
        s.paidAt?.slice(0, 10),
        s.paidMethod === 'payer' ? 'paid the business' : s.paidMethod,
        s.paymentReference,
      ]),
  ]);

  const years = [...new Set(files.map((f) => f.folder.slice(0, 4)))].sort();
  const readme = [
    `${hh.name}: bills exported ${today}`,
    '',
    `${bills.length} bills and ${files.length} files.`,
    '',
    'bills.csv        One row per bill: what it was for, the business, dates, amount, tax,',
    '                 whether it was paid, and the files it came with.',
    'files.csv        Every file in this export and the bill it belongs to.',
    'instalments.csv  Bills that could be paid in instalments, and each instalment.',
    'shares.csv       How each household bill was split between the people in the house.',
    '',
    'Files are filed by year, then month, then service, and named by date, service and',
    'business, e.g.',
    '  2026/08 August/Council rates/2026-08-11 Council rates - City of Greater Bendigo.pdf',
    'A bill is filed under the month it was issued (for bills without an issue date, the',
    'month of its billing period); receipts and payment notices sit beside the bill they',
    'are about, named by their own date. Personal bills (one person’s own, not the',
    'household’s) are in folders marked "personal".',
    '',
    `Amounts are in ${hh.currency}. Dates are YYYY-MM-DD.`,
    years.length ? `Years in this export: ${years.join(', ')}.` : 'This export has no files.',
    ...(missing.length
      ? [
          '',
          'These files could not be found on the server and are not included:',
          ...missing.map((f) => `  ${f.folder}/${f.name}`),
        ]
      : []),
    '',
  ].join('\n');

  const entries: ZipEntry[] = [
    { name: `${folder}/README.txt`, data: readme },
    { name: `${folder}/bills.csv`, data: billsCsv },
    { name: `${folder}/files.csv`, data: filesCsv },
    ...(withInstalments.length
      ? [{ name: `${folder}/instalments.csv`, data: instalmentsCsv }]
      : []),
    ...(shares.length ? [{ name: `${folder}/shares.csv`, data: sharesCsv }] : []),
    ...files.map((f) => ({
      name: `${folder}/${paths.get(f.doc.id)}`,
      data: () => readDocument(f.doc),
      date: new Date(f.doc.receivedAt),
    })),
  ];
  return { folder, entries };
}

/** Every bill a member may see (the household's and their own), as one spreadsheet. */
export function billsSpreadsheet(
  householdId: string,
  viewerId: string,
  db: Db = getDb(),
): { name: string; body: string } {
  const hh = getHousehold(householdId, db)!;
  const rows = listBills(householdId, { viewer: viewerId }, db).map((b) => [
    b.periodStart,
    b.periodEnd,
    b.service.name,
    b.service.provider,
    b.service.type.label,
    b.asset?.name ?? '',
    formatMinorPlain(b.amountMinor, b.currency),
    b.currency,
    b.taxMinor === null ? '' : formatMinorPlain(b.taxMinor, b.currency),
    b.taxLabel ?? '',
    b.dueDate,
    b.paidToProviderAt ? 'paid' : 'unpaid',
    b.usageQuantity ?? '',
    b.usageUnit ?? '',
    b.externalRef ?? '',
    b.source,
    b.isAnomaly ? 'unusual' : '',
    b.ownerMemberId ? 'personal' : 'household',
  ]);
  const body = csv([
    [
      'period_start',
      'period_end',
      'service',
      'provider',
      'type',
      'vehicle_or_policy',
      'amount',
      'currency',
      'tax',
      'tax_label',
      'due_date',
      'provider_payment',
      'usage',
      'unit',
      'invoice',
      'source',
      'flag',
      'belongs_to',
    ],
    ...rows,
  ]);
  return { name: `${hh.name} bills.csv`, body };
}

/**
 * One member's statement: their shares for a financial year (the current one,
 * the one starting in `fy` = "2025", or every year with `fy` = "all"), and,
 * only when they download their own, their personal bills too.
 */
export function memberStatement(
  householdId: string,
  memberId: string,
  viewerId: string,
  today: string,
  fy: string | null = null,
  db: Db = getDb(),
): { name: string; body: string } | null {
  const hh = getHousehold(householdId, db);
  const ledger = hh && memberLedger(householdId, memberId, today, hh.fiscalYearStartMonth, db);
  if (!hh || !ledger) return null;
  const money = (m: number) => formatMoney(m, hh.currency, hh.locale);
  const startMonth = String(hh.fiscalYearStartMonth).padStart(2, '0');
  const bounds = fiscalYearBounds(
    fy && /^\d{4}$/.test(fy) ? `${fy}-${startMonth}-01` : today,
    hh.fiscalYearStartMonth,
  );
  const everyYear = fy === 'all';
  const inRange = (periodStart: string) =>
    everyYear || (periodStart >= bounds.start && periodStart <= bounds.end);
  const shares = ledger.all.filter((s) => inRange(s.bill.periodStart));
  const total = shares.reduce((t, s) => t + s.amountMinor, 0);
  const paid = shares.filter((s) => s.paidAt).reduce((t, s) => t + s.amountMinor, 0);
  // Their personal bills too, but only in their own statement: nobody else sees them.
  const personal =
    memberId === viewerId
      ? listBills(householdId, { owner: viewerId }, db).filter((b) => inRange(b.periodStart))
      : [];
  const personalTotal = personal.reduce((t, b) => t + b.amountMinor, 0);
  const label = everyYear ? 'all years' : `financial year ${bounds.label}`;
  const body = csv([
    [`${ledger.member.name} — ${hh.name} — ${label}`],
    [`Total shares ${money(total)}`, `Paid ${money(paid)}`],
    [],
    [
      'period_start',
      'period_end',
      'service',
      'provider',
      'bill_amount',
      'your_share',
      'currency',
      'days_active',
      'due_date',
      'paid_on',
      'method',
      'reference',
      'paid_to',
    ],
    ...shares.map((s) => [
      s.bill.periodStart,
      s.bill.periodEnd,
      s.service.name,
      s.service.provider,
      formatMinorPlain(s.bill.amountMinor, s.bill.currency),
      formatMinorPlain(s.amountMinor, s.currency),
      s.currency,
      `${s.basisDays}/${s.periodDays}`,
      s.dueDate ?? s.bill.dueDate,
      s.paidAt ? s.paidAt.slice(0, 10) : '',
      s.paidMethod ?? '',
      s.paymentReference ?? '',
      s.payer?.name ?? '',
    ]),
    ...(personal.length
      ? [
          [],
          [`Personal bills ${money(personalTotal)}`],
          [
            'period_start',
            'period_end',
            'service',
            'business',
            'amount',
            'currency',
            'due_date',
            'paid_to_business_on',
            'invoice',
          ],
          ...personal.map((b) => [
            b.periodStart,
            b.periodEnd,
            b.service.name,
            b.service.provider,
            formatMinorPlain(b.amountMinor, b.currency),
            b.currency,
            b.dueDate,
            b.paidToProviderAt?.slice(0, 10) ?? '',
            b.externalRef ?? '',
          ]),
        ]
      : []),
  ]);
  return {
    name: `${ledger.member.name} statement ${everyYear ? 'all years' : bounds.label}.csv`,
    body,
  };
}
