import { NextResponse } from 'next/server';
import { getMemberForSession } from '@/lib/members';
import { setNotifyPref, verifyUnsubscribe, type NotifyCategory } from '@/lib/notifications';

export const dynamic = 'force-dynamic';

/**
 * RFC 8058 one-click unsubscribe: mail apps (Gmail's "Unsubscribe" button) POST
 * here using the List-Unsubscribe header. The signed link is the proof.
 */
export async function POST(req: Request) {
  const q = new URL(req.url).searchParams;
  const m = q.get('m') ?? '';
  const c = q.get('c') ?? '';
  if (!verifyUnsubscribe(m, c, q.get('t') ?? ''))
    return NextResponse.json({ error: 'invalid' }, { status: 400 });
  const member = getMemberForSession(m);
  if (member) setNotifyPref(member.householdId, member.id, { [c as NotifyCategory]: false });
  return NextResponse.json({ ok: true });
}

/** Opened in a browser: show the confirmation page instead. */
export function GET(req: Request) {
  const url = new URL(req.url);
  return NextResponse.redirect(new URL(`/notifications/unsubscribe${url.search}`, url));
}
