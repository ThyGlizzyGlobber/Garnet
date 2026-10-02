import fs from 'node:fs';
import { NextResponse } from 'next/server';
import { getAccount } from '@/lib/accounts';
import { authState } from '@/lib/auth/session';
import { avatarFile, maySeePhoto } from '@/lib/profile';

export const dynamic = 'force-dynamic';

/** Someone's profile photo: for them and for whoever shares a household with them. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const s = await authState();
  const viewer = s.kind === 'anonymous' ? null : s.account;
  if (!viewer) return new NextResponse('Unauthorized', { status: 401 });
  const { id } = await params;
  const target = getAccount(id);
  if (!target?.avatarAt || !maySeePhoto(viewer.id, id))
    return new NextResponse('Not found', { status: 404 });
  let bytes: Buffer;
  try {
    bytes = fs.readFileSync(avatarFile(id));
  } catch {
    return new NextResponse('Not found', { status: 404 });
  }
  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      'Content-Type': 'image/jpeg',
      // The URL carries the photo's version, so a browser may keep it.
      'Cache-Control': 'private, max-age=31536000, immutable',
    },
  });
}
