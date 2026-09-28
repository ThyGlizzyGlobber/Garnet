import type { SourceDocument } from '@/db/schema';
import type { ScanFile } from './extractors/types';
import { readDocument } from './archive';

/**
 * Scans and photos: documents with no text layer. The AI reader gets the file
 * itself (owner decision 2026-09-28; everything else is sent as text only).
 */

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] as const;
/** The API's request limit is 32 MB and base64 adds a third. */
const MAX_PDF_BYTES = 20 * 1024 * 1024;
/** Photos are shrunk to this long edge; the API reads nothing finer. */
const MAX_EDGE = 1568;
const MAX_RAW_IMAGE_BYTES = 5 * 1024 * 1024;

export function isImageFile(mime: string | null | undefined, name: string | null | undefined) {
  return (
    (mime ?? '').toLowerCase().startsWith('image/') ||
    /\.(jpe?g|png|webp|gif|heic|heif)$/i.test(name ?? '')
  );
}

function isPdf(doc: Pick<SourceDocument, 'mimeType' | 'originalFilename' | 'path'>) {
  return (
    (doc.mimeType ?? '').includes('pdf') ||
    /\.pdf$/i.test(doc.originalFilename ?? '') ||
    doc.path.endsWith('.pdf')
  );
}

export type ScanResult = { file: ScanFile } | { problem: string } | null;

/** The file to send for a document without text, a reason it can't be, or null (not a scan). */
export async function scanFor(doc: SourceDocument): Promise<ScanResult> {
  if (isPdf(doc)) {
    const data = readDocument(doc);
    if (data.length > MAX_PDF_BYTES)
      return { problem: 'This scan is too large for the AI reader (over 20 MB)' };
    return { file: { mediaType: 'application/pdf', data } };
  }
  if (!isImageFile(doc.mimeType, doc.originalFilename)) return null;
  const data = readDocument(doc);
  const shrunk = await shrinkPhoto(data);
  if (shrunk) return { file: { mediaType: 'image/jpeg', data: shrunk } };
  // No image library: send supported photos as they are, when small enough.
  const type = IMAGE_TYPES.find((t) => t === (doc.mimeType ?? '').toLowerCase());
  if (type && data.length <= MAX_RAW_IMAGE_BYTES) return { file: { mediaType: type, data } };
  return {
    problem: /heic|heif/i.test(`${doc.mimeType} ${doc.originalFilename}`)
      ? 'iPhone HEIC photos can’t be read yet; send the photo as a JPEG'
      : 'This photo couldn’t be prepared for the AI reader',
  };
}

/** Upright (EXIF), at most MAX_EDGE on the long side, JPEG. Null when it can't be decoded. */
async function shrinkPhoto(data: Buffer): Promise<Buffer | null> {
  try {
    const { default: sharp } = await import('sharp');
    return await sharp(data)
      .rotate()
      .resize({ width: MAX_EDGE, height: MAX_EDGE, fit: 'inside', withoutEnlargement: true })
      .flatten({ background: '#ffffff' })
      .jpeg({ quality: 85 })
      .toBuffer();
  } catch {
    return null;
  }
}
