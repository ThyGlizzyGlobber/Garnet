import { PDFParse } from 'pdf-parse';

/** Extract plain text from a PDF buffer. Returns '' for image-only PDFs. */
export async function pdfToText(buffer: Buffer): Promise<string> {
  const parser = new PDFParse({ data: new Uint8Array(buffer) });
  try {
    const result = await parser.getText();
    return normaliseText(result.text ?? '');
  } finally {
    await parser.destroy();
  }
}

/** Collapse whitespace but keep line structure, which template parsers rely on. */
export function normaliseText(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t ]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
