/**
 * Extract plain text from a PDF buffer. Returns '' for image-only PDFs.
 * pdf-parse (pdf.js) is loaded lazily: it is heavy and probes for canvas
 * polyfills at load time, which must not happen during server start-up.
 */
export async function pdfToText(buffer: Buffer): Promise<string> {
  const { PDFParse } = await import('pdf-parse');
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
