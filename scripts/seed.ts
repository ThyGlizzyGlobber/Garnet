import { getEnv } from '@/lib/env';
import { runMigrations } from '@/db/migrate';
import { seedDemo, seedReal } from '@/db/seed';

async function main() {
  const env = getEnv();
  runMigrations(env.DATA_DIR);
  const mode = process.argv[2] ?? (env.DEMO_MODE ? 'demo' : 'real');
  const result = mode === 'demo' ? await seedDemo() : await seedReal();
  console.log(`Seeded (${mode}):`, result);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
