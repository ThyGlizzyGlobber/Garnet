import { NextResponse } from 'next/server';
import { currentMember } from '@/lib/auth/session';
import { listBills } from '@/lib/bills';
import { formatMoney } from '@/lib/format';
import { getHousehold } from '@/lib/households';
import { fiscalYearBounds } from '@/lib/periods';
import { memberLedger } from '@/lib/stats';
import { todayIn } from '@/lib/dates';

export const dynamic = 'force-dynamic';

function csv(rows: (string | number | null | undefined)[][]): string {
  return (
    rows
      .map((r) =>
        r
          .map((v) =>
            v === null || v === undefined
              ? ''
              : /[",\n]/.test(String(v))
                ? `"${String(v).replace(/"/g, '""')}"`
                : String(v),
          )
          .join(','),
      )
      .join('\n') + '\n'
  );
}

/**
 * CSV statements.
 *   /api/export?kind=member&member=<id>&fy=<label>  — one member's shares for a financial year (default: current)
 *   /api/export?kind=bills                           — every bill in the household
 * Members can export their own statement; the owner can export anyone's.
 */
export async function GET(req: Request) {
  const me = await currentMember();
  if (!me) return new NextResponse('Unauthorized', { status: 401 });
  const hh = getHousehold();
  if (!hh) return new NextResponse('Not set up', { status: 400 });
  const url = new URL(req.url);
  const kind = url.searchParams.get('kind') ?? 'member';
  const today = todayIn(hh.timezone);
  const money = (m: number, c = hh.currency) => formatMoney(m, c, hh.locale);
  const filename = (base: string) =>
    `Content-Disposition: attachment; filename="${base}.csv"`.slice('Content-Disposition: '.length);

  if (kind === 'bills') {
    if (me.role !== 'owner') return new NextResponse('Owner only', { status: 403 });
    const rows = listBills().map((b) => [
      b.periodStart,
      b.periodEnd,
      b.service.name,
      b.service.provider,
      b.service.type.label,
      (b.amountMinor / 100).toFixed(2),
      b.currency,
      b.taxMinor === null ? '' : (b.taxMinor / 100).toFixed(2),
      b.taxLabel ?? '',
      b.dueDate,
      b.paidToProviderAt ? 'paid' : 'unpaid',
      b.usageQuantity ?? '',
      b.usageUnit ?? '',
      b.externalRef ?? '',
      b.source,
      b.isAnomaly ? 'unusual' : '',
    ]);
    const body = csv([
      [
        'period_start',
        'period_end',
        'service',
        'provider',
        'type',
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
      ],
      ...rows,
    ]);
    return new NextResponse(body, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': filename(`${hh.name.replace(/\W+/g, '-')}-bills`),
      },
    });
  }

  const memberId = url.searchParams.get('member') ?? me.id;
  if (memberId !== me.id && me.role !== 'owner')
    return new NextResponse('Forbidden', { status: 403 });
  const ledger = memberLedger(memberId, today, hh.fiscalYearStartMonth);
  if (!ledger) return new NextResponse('Not found', { status: 404 });
  const fy = fiscalYearBounds(today, hh.fiscalYearStartMonth);
  const wanted = url.searchParams.get('fy');
  const inRange = ledger.recent.filter((s) =>
    wanted ? true : s.bill.periodStart >= fy.start && s.bill.periodStart <= fy.end,
  );
  const rows = inRange.map((s) => [
    s.bill.periodStart,
    s.bill.periodEnd,
    s.service.name,
    s.service.provider,
    (s.bill.amountMinor / 100).toFixed(2),
    (s.amountMinor / 100).toFixed(2),
    s.currency,
    `${s.basisDays}/${s.periodDays}`,
    s.bill.dueDate,
    s.paidAt ? s.paidAt.slice(0, 10) : '',
    s.paidMethod ?? '',
    s.paymentReference ?? '',
    s.payer?.name ?? '',
  ]);
  const total = inRange.reduce((t, s) => t + s.amountMinor, 0);
  const body = csv([
    [`${ledger.member.name} — ${hh.name} — financial year ${fy.label}`],
    [`Total shares ${money(total)}`, `Paid ${money(ledger.paidThisFy)}`],
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
    ...rows,
  ]);
  return new NextResponse(body, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': filename(
        `${ledger.member.name}-statement-${fy.label.replace('–', '-')}`,
      ),
    },
  });
}
