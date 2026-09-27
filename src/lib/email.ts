import { appUrl, getEnv, isEmailConfigured } from '@/lib/env';

export interface OutgoingEmail {
  to: string;
  subject: string;
  text: string;
  html: string;
  replyTo?: string;
  headers?: Record<string, string>;
  attachments?: { filename: string; content: Buffer; contentType?: string }[];
}

export type SendResult = { sent: true } | { sent: false; reason: string };

/** Emails sent in development when no sending service is configured, newest last (tests read these). */
export const devOutbox: OutgoingEmail[] = [];

/**
 * Send through Resend's HTTP API. With EMAIL_LOG_ONLY, or without
 * RESEND_API_KEY in development and tests, the email is written to the server
 * log (and kept in devOutbox) instead; production without a key reports it as
 * not sent.
 */
export async function sendEmail(
  email: OutgoingEmail,
  fetchImpl: typeof fetch = fetch,
): Promise<SendResult> {
  const env = getEnv();
  if (env.EMAIL_LOG_ONLY || !isEmailConfigured(env)) {
    if (!env.EMAIL_LOG_ONLY && env.NODE_ENV === 'production')
      return { sent: false, reason: 'Email is not configured' };
    devOutbox.push(email);
    const files = email.attachments?.length
      ? `\n[attachments: ${email.attachments.map((a) => a.filename).join(', ')}]`
      : '';
    console.log(`[email:dev] to=${email.to} subject="${email.subject}"\n${email.text}${files}`);
    return { sent: true };
  }
  try {
    const res = await fetchImpl('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: env.EMAIL_FROM,
        to: [email.to],
        subject: email.subject,
        text: email.text,
        html: email.html,
        ...(email.replyTo ? { reply_to: email.replyTo } : {}),
        ...(email.headers ? { headers: email.headers } : {}),
        ...(email.attachments?.length
          ? {
              attachments: email.attachments.map((a) => ({
                filename: a.filename,
                content: a.content.toString('base64'),
                ...(a.contentType ? { content_type: a.contentType } : {}),
              })),
            }
          : {}),
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return { sent: false, reason: `Email service answered ${res.status}` };
    return { sent: true };
  } catch (e) {
    return { sent: false, reason: (e as Error).message };
  }
}

export function escapeHtml(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );
}

export type EmailBlock =
  { p: string } | { code: string } | { button: { label: string; href: string } };

/**
 * A plain, readable email built from blocks in order: paragraphs, a big code,
 * a button. Copy comes from the caller (next-intl), never hard-coded here.
 */
export function composeEmail(parts: {
  to: string;
  subject: string;
  blocks: EmailBlock[];
  footer?: string;
}): OutgoingEmail {
  const text = [
    ...parts.blocks.map((b) =>
      'p' in b ? b.p : 'code' in b ? b.code : `${b.button.label}: ${b.button.href}`,
    ),
    ...(parts.footer ? [parts.footer] : []),
  ].join('\n\n');
  const html = `<!doctype html><html><body style="margin:0;padding:24px;background:#ece7df;font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#1d2230">
<div style="max-width:480px;margin:0 auto;background:#fff;border-radius:16px;padding:28px">
${parts.blocks
  .map((b) =>
    'p' in b
      ? `<p style="margin:0 0 16px;line-height:1.5">${escapeHtml(b.p)}</p>`
      : 'code' in b
        ? `<p style="margin:8px 0 20px;font:600 32px/1.2 ui-monospace,Menlo,monospace;letter-spacing:6px">${escapeHtml(b.code)}</p>`
        : `<p style="margin:8px 0 20px"><a href="${escapeHtml(b.button.href)}" style="display:inline-block;background:#3a4a63;color:#fff;text-decoration:none;padding:12px 20px;border-radius:999px;font-weight:600">${escapeHtml(b.button.label)}</a></p>`,
  )
  .join('\n')}
${parts.footer ? `<p style="margin:16px 0 0;font-size:13px;color:#6b7280">${escapeHtml(parts.footer)}</p>` : ''}
</div></body></html>`;
  return { to: parts.to, subject: parts.subject, text, html };
}

export { appUrl };
