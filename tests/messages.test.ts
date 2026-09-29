import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Every message the code asks for exists in messages/en.json. A missing one
 * only shows up at runtime (the raw key on screen and an error in the log), so
 * this reads each translator (`const t = await getTranslations('bills')` or
 * `useTranslations(...)`) and checks every t('key') it's called with. Keys
 * built at runtime (t(`status.${s}`)) are checked up to the variable part.
 */
const root = path.resolve(import.meta.dirname, '..');
const messages = JSON.parse(fs.readFileSync(path.join(root, 'messages/en.json'), 'utf8'));
const exists = (key: string) =>
  key
    .split('.')
    .reduce<unknown>(
      (o, k) => (o && typeof o === 'object' ? (o as Record<string, unknown>)[k] : undefined),
      messages,
    ) !== undefined;

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? sourceFiles(p) : /\.tsx?$/.test(e.name) ? [p] : [];
  });
}

describe('messages', () => {
  it('has every key the code uses', () => {
    const missing: string[] = [];
    for (const file of sourceFiles(path.join(root, 'src'))) {
      const src = fs.readFileSync(file, 'utf8');
      const bindings = [
        ...src.matchAll(
          /(?:const|let)\s+(\w+)\s*=\s*(?:await\s+)?(?:getTranslations|useTranslations)\(\s*'([^']*)'\s*\)/g,
        ),
      ].map((m) => ({ name: m[1]!, ns: m[2]!, at: m.index }));
      for (const name of new Set(bindings.map((b) => b.name))) {
        const call = new RegExp(
          `\\b${name}(?:\\.rich|\\.markup|\\.raw)?\\(\\s*(?:'([^']+)'|\`([^\`]+)\`)`,
          'g',
        );
        for (const m of src.matchAll(call)) {
          // The translator in scope: the nearest one declared before the call.
          const ns = bindings.filter((b) => b.name === name && b.at < m.index).at(-1)?.ns;
          if (ns === undefined) continue;
          const key = m[1] ?? m[2]!;
          const dynamic = key.indexOf('${');
          const full = `${ns}.${dynamic >= 0 ? key.slice(0, dynamic) : key}`.replace(/\.$/, '');
          if (!exists(full)) missing.push(`${path.relative(root, file)}: ${full}`);
        }
      }
    }
    expect(missing).toEqual([]);
  });
});
