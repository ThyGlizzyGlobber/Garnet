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
  /** How long a PIN unlock (or a fresh sign-in) lasts before the PIN is asked again. */
  AUTH_SESSION_DAYS: z.coerce.number().positive().default(7),
  /** How long a browser stays trusted after a full sign-in (Google or emailed code). */
  AUTH_DEVICE_DAYS: z.coerce.number().int().positive().default(180),
  /** Public base URL, e.g. https://home.example.com. Used in emails and the Google redirect. */
  APP_URL: z.string().url().optional(),
  /** Comma-separated emails that get operator rights (software updates, mailbox polling). */
  OPERATOR_EMAILS: z.string().default(''),

  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().default('Home Utilities <no-reply@localhost>'),
  /** Write emails to the server log instead of sending (local testing, or before email is set up). */
  EMAIL_LOG_ONLY: boolish.default(false),

  DEFAULT_CURRENCY: z.string().length(3).toUpperCase().default('AUD'),
  DEFAULT_LOCALE: z.string().min(2).default('en-AU'),
  DEFAULT_TIMEZONE: z.string().min(1).default('Australia/Melbourne'),
  DEFAULT_FISCAL_YEAR_START_MONTH: z.coerce.number().int().min(1).max(12).default(7),

  /**
   * Household bills addresses, with {alias} standing for the household's part,
   * e.g. "{alias}@brjlabs.com" or "bills+{alias}@bills.brjlabs.com". Empty = off.
   */
  BILLS_ADDRESS_TEMPLATE: z
    .string()
    .regex(
      /^[^@\s{}]*\{alias\}[^@\s{}]*@[a-z0-9.-]+\.[a-z]{2,}$/i,
      'BILLS_ADDRESS_TEMPLATE must look like {alias}@example.com',
    )
    .optional(),
  /** Shared with the Cloudflare Email Worker; signs every delivered message. */
  INBOUND_EMAIL_SECRET: z
    .string()
    .min(32, 'INBOUND_EMAIL_SECRET must be at least 32 characters')
    .optional(),
  /** Messages accepted per household per hour on its bills address. */
  INBOUND_MAX_PER_HOUR: z.coerce.number().int().positive().default(60),

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
  /** AI bill reads per household per month; beyond it, unknown bills go to the review queue. */
  AI_MONTHLY_LIMIT: z.coerce.number().int().min(0).default(60),

  DEMO_MODE: boolish.default(false),

  // Stamped into the image by the release workflow; 'dev' for local builds.
  APP_COMMIT: z.string().default('dev'),
  APP_BUILT_AT: z.string().optional(),
  // Settings → Software update reads the latest released build from GitHub.
  UPDATE_REPO: z
    .string()
    .regex(/^[\w.-]+\/[\w.-]+$/, 'UPDATE_REPO must look like owner/repo')
    .optional(),
  UPDATE_GITHUB_TOKEN: z.string().optional(),
  UPDATE_WORKFLOW: z.string().default('release.yml'),
  UPDATE_BRANCH: z.string().default('main'),
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

export function isUpdateCheckConfigured(env: Env = getEnv()): boolean {
  return Boolean(env.UPDATE_REPO && env.UPDATE_GITHUB_TOKEN);
}

export function isGoogleConfigured(env: Env = getEnv()): boolean {
  return Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);
}

/** Email can be delivered for real. Without it, development builds log emails instead. */
export function isEmailConfigured(env: Env = getEnv()): boolean {
  return Boolean(env.RESEND_API_KEY);
}

/** Base URL for links in emails and OAuth redirects. */
export function appUrl(env: Env = getEnv()): string {
  return (env.APP_URL ?? `http://localhost:${env.PORT}`).replace(/\/+$/, '');
}

export function operatorEmails(env: Env = getEnv()): string[] {
  return env.OPERATOR_EMAILS.split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function isInboundEmailConfigured(env: Env = getEnv()): boolean {
  return Boolean(env.BILLS_ADDRESS_TEMPLATE && env.INBOUND_EMAIL_SECRET);
}

export function isLlmConfigured(env: Env = getEnv()): boolean {
  return Boolean(env.ANTHROPIC_API_KEY);
}
