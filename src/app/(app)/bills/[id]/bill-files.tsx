import { getTranslations } from 'next-intl/server';
import { Badge, Card } from '@/components/ui';
import { InlineAction } from '@/components/ui/form';
import type { BillFile } from '@/lib/bill-files';
import type { PageContext } from '@/lib/context';
import { rotateDocumentAction } from '../actions';

/** "Bill email & file": everything that came with the bill, each with a link to open it. */
export async function BillFilesCard({
  billId,
  files,
  enteredByHand,
  ctx,
}: {
  billId: string;
  files: BillFile[];
  enteredByHand: boolean;
  ctx: PageContext;
}) {
  const t = await getTranslations('bills');
  return (
    <Card className="scroll-mt-24" id="files">
      <h2 className="font-display text-lg font-semibold">{t('files.title')}</h2>
      {files.length === 0 ? (
        <p className="mt-3 text-sm text-fg-muted">
          {enteredByHand ? t('files.byHand') : t('files.none')}
        </p>
      ) : (
        <ul className="mt-3 flex flex-col divide-y divide-border">
          {files.map((f) => (
            <FileRow key={f.doc.id} file={f} billId={billId} ctx={ctx} />
          ))}
        </ul>
      )}
    </Card>
  );
}

/** One file that came with the bill: who sent it, its email details, and a link to open it. */
async function FileRow({
  file: f,
  billId,
  ctx,
}: {
  file: BillFile;
  billId: string;
  ctx: PageContext;
}) {
  const t = await getTranslations('bills');
  const doc = f.doc;
  const when = ctx.date(doc.receivedAt);
  const who = f.arrival;
  const line =
    who.kind === 'upload'
      ? who.name
        ? t('files.uploadedBy', { name: who.name, date: when })
        : t('files.uploaded', { date: when })
      : who.kind === 'forward'
        ? t('files.forwardedBy', { name: who.name, date: when })
        : t('files.emailed', { date: when });
  const open = {
    pdf: t('files.viewPdf'),
    photo: t('files.viewPhoto'),
    email: t('files.viewEmail'),
  };
  return (
    <li className="flex flex-col gap-1.5 py-3 first:pt-0 last:pb-0">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold">{t(`files.kind.${f.kind}`)}</p>
          <p className="text-xs text-fg-muted">{line}</p>
        </div>
        {doc.senderVerified === true && doc.senderDomain && (
          <Badge tone="success">{t('files.signed', { domain: doc.senderDomain })}</Badge>
        )}
      </div>
      {doc.emailSubject && <p className="text-sm">{doc.emailSubject}</p>}
      {doc.emailFrom && (
        <p className="truncate text-xs text-fg-muted">{t('files.from', { from: doc.emailFrom })}</p>
      )}
      {doc.originalFilename && (
        <p className="truncate font-mono text-xs text-fg-muted">{doc.originalFilename}</p>
      )}
      <div className="mt-1 flex flex-wrap items-center gap-2">
        <a
          href={`/api/documents/${doc.id}/file`}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 rounded-full border border-border-strong bg-surface-2 px-4 py-2 text-sm font-semibold hover:bg-surface"
        >
          {open[f.view]} <span aria-hidden="true">↗</span>
        </a>
        {f.canTurn && (
          <InlineAction
            action={rotateDocumentAction}
            hidden={{ id: doc.id, billId }}
            label={t('files.turn')}
            variant="ghost"
          />
        )}
      </div>
    </li>
  );
}
