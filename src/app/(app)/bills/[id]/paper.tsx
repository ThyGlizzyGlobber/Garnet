import { getTranslations } from 'next-intl/server';
import { Icon } from '@/components/app/icons';
import type { BillFile } from '@/lib/bill-files';
import type { BillDetail } from '@/lib/bills';
import type { PageContext } from '@/lib/context';
import { colourCss } from '@/lib/palette';
import { documentPreview } from '@/ingest/preview';

/**
 * The bill's document beside its details (D8): the real first page of its
 * PDF (drawn once and kept), the photo itself, or, for an email or a bill
 * entered by hand, a drawn stand-in page. Opens the file in a new tab.
 */
export async function Paper({
  bill: b,
  file,
  ctx,
}: {
  bill: BillDetail;
  file: BillFile | undefined;
  ctx: PageContext;
}) {
  const t = await getTranslations('bills.paper');
  const tu = await getTranslations('ui.doc');
  const { money, date } = ctx;
  const style = { ['--svc' as string]: colourCss(b.service.colour) };
  const stamp = (
    <span className="paper-stamp">
      <Icon name="check" width={12} height={12} /> {tu('analysed')}
    </span>
  );
  const label = t('label', { provider: b.service.provider });
  if (file) {
    const href = `/api/documents/${file.doc.id}/file`;
    if (file.view === 'photo')
      return (
        <a
          href={href}
          target="_blank"
          rel="noreferrer"
          className="paper real photo"
          style={style}
          aria-label={label}
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- archived file, served as-is */}
          <img src={href} alt="" />
          {stamp}
        </a>
      );
    if (file.view === 'pdf' && (await documentPreview(file.doc)))
      return (
        <a
          href={href}
          target="_blank"
          rel="noreferrer"
          className="paper real"
          style={style}
          aria-label={label}
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- drawn from the PDF, served by the app */}
          <img src={`/api/documents/${file.doc.id}/preview`} alt="" />
          {stamp}
        </a>
      );
    if (file.view === 'email')
      return (
        <a
          href={href}
          target="_blank"
          rel="noreferrer"
          className="paper mail"
          style={style}
          aria-label={label}
        >
          <div className="paper-top">
            <span className="paper-logo">
              <Icon name="mail" width={14} height={14} />
            </span>
            <b>{b.service.provider}</b>
            <span>{t('email')}</span>
          </div>
          <div className="paper-mail-head">
            <b>{file.doc.emailSubject ?? t('email')}</b>
            {file.doc.emailFrom && <span>{file.doc.emailFrom}</span>}
            <span>{date(file.doc.receivedAt)}</span>
          </div>
          <div className="paper-amt">
            <span>{t('amountDue')}</span>
            <b>{money(b.fullAmountMinor ?? b.amountMinor, b.currency)}</b>
            <span>{t('by', { date: date(b.fullDueDate ?? b.dueDate) })}</span>
          </div>
          <div className="paper-lines">
            {Array.from({ length: 6 }, (_, i) => (
              <i key={i} />
            ))}
          </div>
          {stamp}
        </a>
      );
  }
  // A bill without a file: the drawn page, so the page still reads as designed.
  return (
    <div className="paper" style={style} aria-label={label}>
      <div className="paper-top">
        <span className="paper-logo">
          <Icon name={b.service.type.icon} width={14} height={14} />
        </span>
        <b>{b.service.provider}</b>
        <span>{t('invoice')}</span>
      </div>
      <div className="paper-amt">
        <span>{t('amountDue')}</span>
        <b>{money(b.fullAmountMinor ?? b.amountMinor, b.currency)}</b>
        <span>{t('by', { date: date(b.fullDueDate ?? b.dueDate) })}</span>
      </div>
      <div className="paper-lines">
        {Array.from({ length: 9 }, (_, i) => (
          <i key={i} />
        ))}
      </div>
      <div className="paper-table">
        {Array.from({ length: 8 }, (_, i) => (
          <i key={i} />
        ))}
      </div>
      <div className="paper-bars">
        {[46, 52, 40, 38, 58, 64, 60, 72].map((h, i) => (
          <i
            key={i}
            style={{ height: `${h}%`, ...(i === 7 ? { background: 'var(--svc)' } : {}) }}
          />
        ))}
      </div>
      <div className="paper-slip">
        <span>{t('slip')}</span>
        <i />
        <i />
      </div>
      {file || b.sourceDocumentId ? stamp : null}
    </div>
  );
}
