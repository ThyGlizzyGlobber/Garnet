import { NextResponse } from 'next/server';
import { sql } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { getEnv, isImapConfigured, isLlmConfigured } from '@/lib/env';
import { dataPaths } from '@/lib/paths';

export const dynamic = 'force-dynamic';

/** Liveness + basic readiness. Used by the Docker HEALTHCHECK and the status page (Phase 3). */
export function GET() {
  const env = getEnv();
  try {
    getDb().run(sql`select 1`);
    return NextResponse.json({
      status: 'ok',
      version: process.env.npm_package_version ?? '0.0.1',
      dataDir: dataPaths(env.DATA_DIR).root,
      database: 'ok',
      imapConfigured: isImapConfigured(env),
      llmConfigured: isLlmConfigured(env),
      demoMode: env.DEMO_MODE,
      time: new Date().toISOString(),
    });
  } catch (err) {
    return NextResponse.json(
      { status: 'error', database: 'unavailable', message: (err as Error).message },
      { status: 503 },
    );
  }
}
