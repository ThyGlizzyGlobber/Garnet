import { NextResponse } from 'next/server';
import { getDocument } from '@/ingest/archive';
import { documentPreview } from '@/ingest/preview';
import { currentMember } from '@/lib/auth/session';
import { getReviewItem } from '@/lib/review';

export const dynamic = 'force-dynamic';

/** The first page of a bill's PDF as a PNG, for the bill page (drawn once, then kept). */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const me = await currentMember();
  if (!me) return new NextResponse('Unauthorized', { status: 401 });
  const { id } = await params;
  const doc = getDocument(me.householdId, id);
  if (!doc || !getReviewItem(me.householdId, id, undefined, { viewer: me.id }))
    return new NextResponse('Not found', { status: 404 });
  const png = await documentPreview(doc);
  if (!png) return new NextResponse('No preview', { status: 404 });
  return new NextResponse(new Uint8Array(png), {
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': 'private, no-cache',
    },
  });
}
