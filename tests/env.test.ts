import { describe, expect, it } from 'vitest';
import { isImapConfigured, isLlmConfigured, parseEnv } from '@/lib/env';

const base = { AUTH_SECRET: 'x'.repeat(32) };

describe('parseEnv', () => {
  it('applies defaults', () => {
    const env = parseEnv(base);
    expect(env.DATA_DIR).toBe('./data');
    expect(env.PORT).toBe(3000);
    expect(env.DEFAULT_CURRENCY).toBe('AUD');
    expect(env.DEFAULT_FISCAL_YEAR_START_MONTH).toBe(7);
    expect(env.DEMO_MODE).toBe(false);
    expect(env.EXTRACTOR_CONFIDENCE_THRESHOLD).toBe(0.85);
  });

  it('rejects a short AUTH_SECRET with a readable message', () => {
    expect(() => parseEnv({ AUTH_SECRET: 'short' })).toThrow(/AUTH_SECRET/);
  });

  it('treats empty strings as unset', () => {
    const env = parseEnv({ ...base, IMAP_USER: '', ANTHROPIC_API_KEY: '' });
    expect(env.IMAP_USER).toBeUndefined();
    expect(isImapConfigured(env)).toBe(false);
    expect(isLlmConfigured(env)).toBe(false);
  });

  it('parses booleans and numbers from strings', () => {
    const env = parseEnv({ ...base, DEMO_MODE: 'true', IMAP_SECURE: '0', PORT: '8080' });
    expect(env.DEMO_MODE).toBe(true);
    expect(env.IMAP_SECURE).toBe(false);
    expect(env.PORT).toBe(8080);
  });

  it('upper-cases the currency code', () => {
    expect(parseEnv({ ...base, DEFAULT_CURRENCY: 'usd' }).DEFAULT_CURRENCY).toBe('USD');
  });
});
