import { defineConfig } from 'drizzle-kit';
import path from 'node:path';

const dataDir = process.env.DATA_DIR ?? './data';

export default defineConfig({
  dialect: 'sqlite',
  schema: './src/db/schema.ts',
  out: './drizzle',
  dbCredentials: { url: path.join(dataDir, 'db', 'utilities.sqlite') },
  strict: true,
  verbose: true,
});
