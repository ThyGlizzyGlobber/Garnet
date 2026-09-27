import { NextResponse } from 'next/server';
import { sql } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { getEnv } from '@/lib/env';
import pkg from '../../../../package.json';

export const dynamic = 'force-dynamic';

/**
 * Liveness + basic readiness for the Docker HEALTHCHECK and the update watcher.
 * Public (it's reachable through the tunnel), so it reports nothing about configuration.
 */
export function GET() {
  const env = getEnv();
  try {
    getDb().run(sql`select 1`);
    return NextResponse.json({
      status: 'ok',
      version: pkg.version,
      commit: env.APP_COMMIT,
      builtAt: env.APP_BUILT_AT ?? null,
      database: 'ok',
      time: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[health] database check failed:', (err as Error).message);
    return NextResponse.json({ status: 'error', database: 'unavailable' }, { status: 503 });
  }
}
