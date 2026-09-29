/**
 * Dry-run the reader on local bill files. No writes to the household database.
 *   npm run extract:dry-run -- sample-bills/*.pdf
 *   npm run extract:dry-run -- --json ...          (machine-readable)
 * Needs ANTHROPIC_API_KEY: the AI reader is the only extractor. Scans and photos
 * (no text layer) are sent as files, exactly as the pipeline does.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openDb } from '@/db/client';
import { runMigrations } from '@/db/migrate';
import { allExtractors } from '@/ingest/extractors';
import { runExtractors } from '@/ingest/pipeline';
import { hasNoText, scanFile } from '@/ingest/scan';
import { extractText } from '@/ingest/text';
import { getEnv } from '@/lib/env';
import { listServiceTypes } from '@/lib/services';

async function main() {
  const args = process.argv.slice(2);
  const json = args.includes('--json');
  const files = args.filter((a) => !a.startsWith('--'));
  if (files.length === 0) {
    console.error('Usage: npm run extract:dry-run -- [--json] <file...>');
    process.exit(2);
  }
  const env = getEnv();
  const services = tryLoadServices();
  const serviceTypes = catalogTypes();
  const out: unknown[] = [];
  for (const file of files) {
    const buffer = fs.readFileSync(file);
    const name = path.basename(file);
    const text = await extractText(buffer, null, name);
    const scan = hasNoText(text) ? await scanFile(buffer, null, name) : null;
    if (scan && 'problem' in scan) {
      out.push({ file, textChars: text.length, verdict: `REVIEW: ${scan.problem}` });
      if (!json) console.log(`\n=== ${file}\nverdict: REVIEW: ${scan.problem}`);
      continue;
    }
    const input = {
      text,
      filename: name,
      email: null,
      locale: env.DEFAULT_LOCALE,
      defaultCurrency: env.DEFAULT_CURRENCY,
      services,
      serviceTypes,
      file: scan?.file ?? null,
    };
    const { best, attempts } = await runExtractors(input, {
      extractors: allExtractors,
      threshold: env.EXTRACTOR_CONFIDENCE_THRESHOLD,
    });
    const verdict = !best
      ? 'NO RESULT → review'
      : best.confidence >= env.EXTRACTOR_CONFIDENCE_THRESHOLD
        ? 'AUTO'
        : 'REVIEW (low confidence)';
    out.push({ file, textChars: text.length, sentAsFile: !!scan, verdict, attempts, result: best });
    if (!json) {
      console.log(`\n=== ${file} (${scan ? 'sent as a file' : `${text.length} chars of text`})`);
      console.log(`verdict: ${verdict}`);
      for (const a of attempts)
        console.log(
          `  ${a.extractor}: ${a.error ? `ERROR ${a.error}` : a.confidence === null ? 'no result' : `${Math.round(a.confidence * 100)}%`}`,
        );
      if (best) {
        console.log(`  extractor: ${best.extractor}`);
        console.table(best.bill);
        if (best.warnings.length) console.log('  warnings:', best.warnings.join(' | '));
      }
    }
  }
  if (json) console.log(JSON.stringify(out, null, 2));
}

/** Use the household's real services when a database exists, so provider matching is realistic. */
function tryLoadServices() {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { listServices } = require('@/lib/services') as typeof import('@/lib/services');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { primaryHousehold } = require('@/lib/households') as typeof import('@/lib/households');
    const hh = primaryHousehold();
    if (!hh) return [];
    return listServices(hh.id).map((s) => ({
      id: s.id,
      name: s.name,
      provider: s.provider,
      typeSlug: s.typeSlug,
    }));
  } catch {
    return [];
  }
}

/** The built-in service types, from a throwaway database the migrations fill in. */
function catalogTypes(): string[] {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hud-dry-run-'));
  try {
    runMigrations(dir);
    const { sqlite, db } = openDb(dir);
    const slugs = listServiceTypes(db).map((t) => t.slug);
    sqlite.close();
    return slugs;
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
