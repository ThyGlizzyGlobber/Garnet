/**
 * Create the fictional "Riverside House" demo household (the same one
 * DEMO_MODE=true seeds on start). Real data is never seeded.
 *   npm run db:seed:demo
 */
import { getEnv } from '@/lib/env';
import { runMigrations } from '@/db/migrate';
import { seedDemo } from '@/db/demo-seed';

async function main() {
  runMigrations(getEnv().DATA_DIR);
  console.log('Seeded (demo):', await seedDemo());
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
