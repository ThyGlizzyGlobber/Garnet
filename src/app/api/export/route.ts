import { NextResponse } from 'next/server';
import { currentMember } from '@/lib/auth/session';
import { todayIn } from '@/lib/dates';
import {
  billsSpreadsheet,
  canExportHousehold,
  exportEntries,
  exportScope,
  memberStatement,
} from '@/lib/export';
import { getHousehold } from '@/lib/households';
import { contentDisposition } from '@/lib/request';
import { zipResponseStream } from '@/lib/zip';
import { isAdmin } from '@/lib/roles';

export const dynamic = 'force-dynamic';

/**
 * Exports.
 *   /api/export?kind=zip                        — everything, zipped: spreadsheets plus every
 *                                                 source file, filed by year/month/service (the
 *                                                 household's bills and your own personal ones;
 *                                                 members get only their own when the household
 *                                                 keeps exports to admins)
 *   /api/export?kind=bills                      — every bill (the household's and your own), as CSV
 *   /api/export?kind=member&member=<id>&fy=<y>  — one member's shares for the financial year
 *                                                 starting in <y> (default: the current one;
 *                                                 "all" for every year), plus their personal bills
 * Members can download their own statement; admins anyone's shares (never
 * another member's personal bills).
 */
export async function GET(req: Request) {
  const me = await currentMember();
  if (!me) return new NextResponse('Unauthorized', { status: 401 });
  const hh = getHousehold(me.householdId);
  if (!hh) return new NextResponse('Not found', { status: 404 });
  const url = new URL(req.url);
  const kind = url.searchParams.get('kind') ?? 'member';
  const today = todayIn(hh.timezone);
  const csvFile = ({ name, body }: { name: string; body: string }) =>
    new NextResponse(body, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': contentDisposition('attachment', name),
        'Cache-Control': 'private, no-store',
      },
    });

  if (kind === 'zip') {
    const { folder, entries } = exportEntries(hh.id, exportScope(me, hh), today);
    return new NextResponse(zipResponseStream(entries), {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': contentDisposition('attachment', `${folder}.zip`),
        'Cache-Control': 'private, no-store',
      },
    });
  }

  if (kind === 'bills') {
    if (!canExportHousehold(me, hh))
      return new NextResponse('Only admins can download the household’s bills', { status: 403 });
    return csvFile(billsSpreadsheet(hh.id, me.id));
  }

  const memberId = url.searchParams.get('member') ?? me.id;
  if (memberId !== me.id && !isAdmin(me)) return new NextResponse('Forbidden', { status: 403 });
  const statement = memberStatement(hh.id, memberId, me.id, today, url.searchParams.get('fy'));
  return statement ? csvFile(statement) : new NextResponse('Not found', { status: 404 });
}
