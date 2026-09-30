import { getTranslations } from 'next-intl/server';
import type { SourceDocument } from '@/db/schema';
import { Icon } from '@/components/app/icons';
import type { FileView } from '@/lib/bill-files';
import { documentPreview } from '@/ingest/preview';

/**
 * A document still being confirmed, beside the form: the real first page of
 * a PDF (drawn once and kept, D8), the photo itself, or the text that was
 * read from an email. Opens the file in a new tab.
 */
export async function DocPaper({
  doc,
  view,
  text,
}: {
  doc: SourceDocument;
  view: FileView;
  /** The text read from it, for emails and files that can't be drawn. */
  text: string;
}) {
  const t = await getTranslations('review.confirm');
  const href = `/api/documents/${doc.id}/file`;
  const label = t('viewFile');
  if (view === 'photo')
    return (
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        className="paper real photo"
        aria-label={label}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- archived file, served as-is */}
        <img src={href} alt="" />
      </a>
    );
  if (view === 'pdf' && (await documentPreview(doc)))
    return (
      <a href={href} target="_blank" rel="noreferrer" className="paper real" aria-label={label}>
        {/* eslint-disable-next-line @next/next/no-img-element -- drawn from the PDF, served by the app */}
        <img src={`/api/documents/${doc.id}/preview`} alt="" />
      </a>
    );
  return (
    <a href={href} target="_blank" rel="noreferrer" className="doc-text" aria-label={label}>
      {doc.emailSubject && (
        <b>
          <Icon name="mail" width={12} height={12} /> {doc.emailSubject}
          {'\n'}
        </b>
      )}
      {text || t('noText')}
    </a>
  );
}
