import { NextResponse } from 'next/server';
import { currentMember } from '@/lib/auth/session';
import { getDocument, readDocument } from '@/ingest/archive';

export const dynamic = 'force-dynamic';

/** Serve an archived bill file to a logged-in member (inline, for the review viewer). */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const me = await currentMember();
  if (!me) return new NextResponse('Unauthorized', { status: 401 });
  const { id } = await params;
  const doc = getDocument(me.householdId, id);
  if (!doc) return new NextResponse('Not found', { status: 404 });
  const body = readDocument(doc);
  const type =
    doc.mimeType ?? (doc.path.endsWith('.pdf') ? 'application/pdf' : 'application/octet-stream');
  return new NextResponse(new Uint8Array(body), {
    headers: {
      'Content-Type': type.startsWith('message/') ? 'text/plain; charset=utf-8' : type,
      'Content-Disposition': `inline; filename="${(doc.originalFilename ?? 'document').replace(/"/g, '')}"`,
      'Cache-Control': 'private, max-age=3600',
    },
  });
}
