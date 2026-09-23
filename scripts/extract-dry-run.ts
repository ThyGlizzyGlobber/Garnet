/**
 * Dry-run the extractor pipeline on local bill files. No database writes.
 *   npm run extract:dry-run -- sample-bills/*.pdf
 *   npm run extract:dry-run -- --llm sample-bills/some-bill.pdf   (skip templates, force the LLM)
 *   npm run extract:dry-run -- --json ...                          (machine-readable)
 */
import fs from 'node:fs';
import path from 'node:path';
import { allExtractors, fallbackExtractors } from '@/ingest/extractors';
import { runExtractors } from '@/ingest/pipeline';
import { extractText } from '@/ingest/text';
import { getEnv } from '@/lib/env';

async function main() {
  const args = process.argv.slice(2);
  const json = args.includes('--json');
  const llmOnly = args.includes('--llm');
  const files = args.filter((a) => !a.startsWith('--'));
  if (files.length === 0) {
    console.error('Usage: npm run extract:dry-run -- [--llm] [--json] <file...>');
    process.exit(2);
  }
  const env = getEnv();
  const extractors = llmOnly ? fallbackExtractors : allExtractors;
  const services = tryLoadServices();
  const out: unknown[] = [];
  for (const file of files) {
    const buffer = fs.readFileSync(file);
    const text = await extractText(buffer, null, path.basename(file));
    const input = {
      text,
      filename: path.basename(file),
      email: null,
      locale: env.DEFAULT_LOCALE,
      defaultCurrency: env.DEFAULT_CURRENCY,
      services,
      serviceTypes: ['internet', 'electricity', 'gas', 'water', 'rent', 'other'],
    };
    const { best, attempts } = await runExtractors(input, {
      extractors,
      threshold: env.EXTRACTOR_CONFIDENCE_THRESHOLD,
    });
    const verdict = !best
      ? 'NO RESULT → review'
      : best.confidence >= env.EXTRACTOR_CONFIDENCE_THRESHOLD
        ? 'AUTO'
        : 'REVIEW (low confidence)';
    out.push({ file, textChars: text.length, verdict, attempts, result: best });
    if (!json) {
      console.log(`\n=== ${file} (${text.length} chars of text)`);
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
    return listServices().map((s) => ({
      id: s.id,
      name: s.name,
      provider: s.provider,
      typeSlug: s.typeSlug,
    }));
  } catch {
    return [];
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
