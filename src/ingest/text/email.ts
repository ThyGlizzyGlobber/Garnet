import { simpleParser } from 'mailparser';
import { htmlToText } from './html';
import { normaliseText } from './pdf';

/**
 * Readable text for a raw email: a few headers, then the body (the HTML part
 * turned into text when there is one, since bills usually live in tables),
 * then any email attached to it (a bill forwarded "as attachment"). Never the
 * raw MIME source, which is mostly signatures and encoded parts.
 */
export async function emailToText(source: Buffer, depth = 0): Promise<string> {
  const parsed = await simpleParser(source);
  const headers = [
    parsed.from?.text ? `From: ${parsed.from.text}` : null,
    parsed.date ? `Date: ${parsed.date.toISOString().slice(0, 10)}` : null,
    parsed.subject ? `Subject: ${parsed.subject}` : null,
  ].filter(Boolean);
  const body = parsed.html ? htmlToText(parsed.html) : normaliseText(parsed.text ?? '');
  const attached =
    depth < 2
      ? await Promise.all(
          (parsed.attachments ?? [])
            .filter((a) => a.contentType === 'message/rfc822')
            .map((a) => emailToText(a.content, depth + 1)),
        )
      : [];
  return [headers.join('\n'), body, ...attached.map((t) => `--- Attached email ---\n${t}`)]
    .filter((s) => s.trim())
    .join('\n\n');
}
