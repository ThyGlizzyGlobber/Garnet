import { createHash } from 'node:crypto';
import { appUrl, getEnv, type Env } from '@/lib/env';
import { randomToken } from './tokens';

/**
 * Google sign-in (OpenID Connect authorization-code flow with PKCE), no SDK.
 * The ID token comes straight from Google's token endpoint over TLS in exchange
 * for our client secret, so per OIDC Core §3.1.3.7 its claims are checked but
 * its signature need not be.
 */
const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const ISSUERS = ['https://accounts.google.com', 'accounts.google.com'];

const GOOGLE_CALLBACK_PATH = '/api/auth/google/callback';

function googleRedirectUri(env: Env = getEnv()): string {
  return `${appUrl(env)}${GOOGLE_CALLBACK_PATH}`;
}

/** Per-attempt secrets kept in a short-lived sealed cookie between start and callback. */
export interface GoogleAttempt {
  state: string;
  nonce: string;
  verifier: string;
}

export function newAttempt(): GoogleAttempt {
  return { state: randomToken(), nonce: randomToken(), verifier: randomToken() };
}

export function authorizationUrl(attempt: GoogleAttempt, env: Env = getEnv()): string {
  const challenge = createHash('sha256').update(attempt.verifier).digest('base64url');
  const q = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID ?? '',
    redirect_uri: googleRedirectUri(env),
    response_type: 'code',
    scope: 'openid email profile',
    state: attempt.state,
    nonce: attempt.nonce,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    prompt: 'select_account',
  });
  return `${AUTH_URL}?${q}`;
}

export interface GoogleIdentity {
  sub: string;
  email: string;
  name: string | null;
}

function decodePayload(idToken: string): Record<string, unknown> {
  const part = idToken.split('.')[1];
  if (!part) throw new Error('Malformed ID token');
  return JSON.parse(Buffer.from(part, 'base64url').toString('utf8')) as Record<string, unknown>;
}

/** Validate the ID token's claims for this client and attempt. */
export function checkClaims(
  claims: Record<string, unknown>,
  expected: { clientId: string; nonce: string },
  now = Date.now(),
): GoogleIdentity {
  if (!ISSUERS.includes(String(claims.iss))) throw new Error('Unexpected issuer');
  const aud = claims.aud;
  if (Array.isArray(aud) ? !aud.includes(expected.clientId) : aud !== expected.clientId)
    throw new Error('Token was not issued for this app');
  if (typeof claims.exp !== 'number' || claims.exp * 1000 <= now) throw new Error('Token expired');
  if (claims.nonce !== expected.nonce) throw new Error('Sign-in attempt did not match');
  if (typeof claims.sub !== 'string' || !claims.sub) throw new Error('Missing subject');
  if (typeof claims.email !== 'string' || claims.email_verified !== true)
    throw new Error('Google has not verified this email address');
  return {
    sub: claims.sub,
    email: claims.email.toLowerCase(),
    name: typeof claims.name === 'string' ? claims.name : null,
  };
}

/** Exchange the authorization code and return the verified identity. */
export async function completeSignIn(
  params: { code: string; state: string },
  attempt: GoogleAttempt,
  opts: { env?: Env; fetchImpl?: typeof fetch; now?: number } = {},
): Promise<GoogleIdentity> {
  const env = opts.env ?? getEnv();
  if (!params.state || params.state !== attempt.state)
    throw new Error('Sign-in attempt did not match');
  const res = await (opts.fetchImpl ?? fetch)(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code: params.code,
      client_id: env.GOOGLE_CLIENT_ID ?? '',
      client_secret: env.GOOGLE_CLIENT_SECRET ?? '',
      redirect_uri: googleRedirectUri(env),
      grant_type: 'authorization_code',
      code_verifier: attempt.verifier,
    }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`Google answered ${res.status}`);
  const body = (await res.json()) as { id_token?: string };
  if (!body.id_token) throw new Error('Google did not return an ID token');
  return checkClaims(
    decodePayload(body.id_token),
    { clientId: env.GOOGLE_CLIENT_ID ?? '', nonce: attempt.nonce },
    opts.now,
  );
}
