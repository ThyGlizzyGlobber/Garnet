import { z } from 'zod';

/**
 * The single place that reads process.env. Everything else imports `getEnv()`.
 * Parsed lazily so `next build` and unit tests don't need a full .env.
 */
const boolish = z
  .union([z.boolean(), z.string()])
  .transform((v) =>
    typeof v === 'boolean' ? v : ['1', 'true', 'yes', 'on'].includes(v.toLowerCase()),
  );

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATA_DIR: z.string().min(1).default('./data'),
  PORT: z.coerce.number().int().positive().default(3000),

  AUTH_SECRET: z.string().min(32, 'AUTH_SECRET must be at least 32 characters'),
  AUTH_SESSION_DAYS: z.coerce.number().int().positive().default(30),

  DEFAULT_CURRENCY: z.string().length(3).toUpperCase().default('AUD'),
  DEFAULT_LOCALE: z.string().min(2).default('en-AU'),
  DEFAULT_TIMEZONE: z.string().min(1).default('Australia/Melbourne'),
  DEFAULT_FISCAL_YEAR_START_MONTH: z.coerce.number().int().min(1).max(12).default(7),

  IMAP_HOST: z.string().optional(),
  IMAP_PORT: z.coerce.number().int().positive().default(993),
  IMAP_SECURE: boolish.default(true),
  IMAP_USER: z.string().optional(),
  IMAP_PASSWORD: z.string().optional(),
  IMAP_MAILBOX: z.string().default('INBOX'),
  IMAP_POLL_INTERVAL_SECONDS: z.coerce.number().int().min(0).default(300),

  ANTHROPIC_API_KEY: z.string().optional(),
  ANTHROPIC_MODEL: z.string().default('claude-sonnet-5'),
  EXTRACTOR_CONFIDENCE_THRESHOLD: z.coerce.number().min(0).max(1).default(0.85),

  DEMO_MODE: boolish.default(false),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | undefined;

/** Parse and validate environment variables. Throws a readable error on misconfiguration. */
export function parseEnv(source: Record<string, string | undefined> = process.env): Env {
  // Treat empty strings as unset so `IMAP_USER=` in .env.example behaves as "not configured".
  const cleaned = Object.fromEntries(
    Object.entries(source).map(([k, v]) => [k, v === '' ? undefined : v]),
  );
  const result = envSchema.safeParse(cleaned);
  if (!result.success) {
    const issues = result.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  return result.data;
}

export function getEnv(): Env {
  if (!cached) cached = parseEnv();
  return cached;
}

/** Test helper: forget the cached env so the next getEnv() re-reads process.env. */
export function resetEnvCache(): void {
  cached = undefined;
}

export function isImapConfigured(env: Env = getEnv()): boolean {
  return Boolean(env.IMAP_HOST && env.IMAP_USER && env.IMAP_PASSWORD);
}

export function isLlmConfigured(env: Env = getEnv()): boolean {
  return Boolean(env.ANTHROPIC_API_KEY);
}
