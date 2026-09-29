import { NextResponse } from 'next/server';
import { currentMember } from '@/lib/auth/session';
import { getDocument, readDocument } from '@/ingest/archive';
import { getReviewItem } from '@/lib/review';

export const dynamic = 'force-dynamic';

/** Serve an archived bill file to a logged-in member (inline, for the review viewer). */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const me = await currentMember();
  if (!me) return new NextResponse('Unauthorized', { status: 401 });
  const { id } = await params;
  const doc = getDocument(me.householdId, id);
  // Another member's personal bill (or its receipt) isn't theirs to open.
  if (!doc || !getReviewItem(me.householdId, id, undefined, { viewer: me.id }))
    return new NextResponse('Not found', { status: 404 });
  const body = readDocument(doc);
  const type =
    doc.mimeType ?? (doc.path.endsWith('.pdf') ? 'application/pdf' : 'application/octet-stream');
  const isPdf = type === 'application/pdf';
  return new NextResponse(new Uint8Array(body), {
    headers: {
      'Content-Type': type.startsWith('message/') ? 'text/plain; charset=utf-8' : type,
      'Content-Disposition': `inline; filename="${(doc.originalFilename ?? 'document').replace(/"/g, '')}"`,
      'Cache-Control': 'private, max-age=3600',
      // Only our own review page may frame it. Anything but a PDF (HTML email
      // bodies, text) runs in a sandbox: no scripts, no forms, its own origin.
      // Chrome's PDF viewer refuses to render under a sandbox, and PDFs don't
      // run page scripts, so they are only restricted to same-origin framing.
      'Content-Security-Policy': isPdf
        ? "frame-ancestors 'self'"
        : "sandbox; default-src 'none'; img-src data:; style-src 'unsafe-inline'; frame-ancestors 'self'",
      'X-Frame-Options': 'SAMEORIGIN',
    },
  });
}
