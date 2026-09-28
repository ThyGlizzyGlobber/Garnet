import { emailToText } from './email';
import { htmlToText } from './html';
import { normaliseText, pdfToText } from './pdf';

/** Best-effort text for any supported bill file. Unknown types return ''. */
export async function extractText(
  buffer: Buffer,
  mimeType: string | null,
  filename?: string | null,
): Promise<string> {
  const name = (filename ?? '').toLowerCase();
  const mime = (mimeType ?? '').toLowerCase();
  if (mime.includes('pdf') || name.endsWith('.pdf')) return pdfToText(buffer);
  if (mime.includes('html') || name.endsWith('.html') || name.endsWith('.htm'))
    return htmlToText(buffer.toString('utf8'));
  if (mime.includes('rfc822') || name.endsWith('.eml')) return emailToText(buffer);
  if (mime.startsWith('text/') || name.endsWith('.txt'))
    return normaliseText(buffer.toString('utf8'));
  return '';
}

export { emailToText, htmlToText, normaliseText, pdfToText };
