import fs from 'node:fs';
import path from 'node:path';

/**
 * Tests keep their databases in temp folders, but bill files are written under
 * DATA_DIR (`.vitest-data`, set in vitest.config.mts). Start every run from an
 * empty folder and remove it afterwards so files don't pile up between runs.
 */
const dir = path.resolve(import.meta.dirname, '..', '.vitest-data');

export default function setup() {
  fs.rmSync(dir, { recursive: true, force: true });
  return () => fs.rmSync(dir, { recursive: true, force: true });
}
