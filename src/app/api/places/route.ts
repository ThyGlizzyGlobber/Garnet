import { NextResponse } from 'next/server';
import { authState } from '@/lib/auth/session';
import { searchPlaces } from '@/lib/location';

export const dynamic = 'force-dynamic';

/**
 * Postcode / suburb search for the location field: ?country=AU&q=3550 or
 * ?country=AU&q=bendigo. Signed-in people only (including someone setting up
 * their first household); the data is public, the endpoint just isn't.
 */
export async function GET(req: Request) {
  const state = await authState();
  if (state.kind !== 'ok' && state.kind !== 'no-household')
    return NextResponse.json({ error: 'sign in first' }, { status: 401 });
  const url = new URL(req.url);
  const country = (url.searchParams.get('country') ?? '').slice(0, 2);
  const q = (url.searchParams.get('q') ?? '').slice(0, 60);
  return NextResponse.json(
    { places: searchPlaces(country, q) },
    { headers: { 'Cache-Control': 'private, max-age=300' } },
  );
}
