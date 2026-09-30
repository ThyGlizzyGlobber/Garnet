import { getTranslations } from 'next-intl/server';
import { fileRowFor, type RowCtx } from '@/components/app/bill-rows';
import { Button, Card } from '@/components/ui';
import { SectionHead } from '@/components/ui/blocks';
import { DocChip } from '@/components/ui/chip';
import { FileRow, FileRowManual } from '@/components/ui/rows';
import type { BillFile } from '@/lib/bill-files';
import type { BillDetail } from '@/lib/bills';
import { rotateDocumentAction } from '../actions';

/** "Bill & files": everything that came with the bill, each opening in a new tab. */
export async function BillFilesCard({
  bill: b,
  files,
  enteredBy,
  rc,
}: {
  bill: BillDetail;
  files: BillFile[];
  /** Who entered a bill by hand, when it has no file. */
  enteredBy: string | null;
  rc: RowCtx;
}) {
  const t = await getTranslations('bills.files');
  const open = { pdf: t('viewPdf'), photo: t('viewPhoto'), email: t('viewEmail') };
  return (
    <Card id="files" className="scroll-mt-24">
      <SectionHead
        title={t('title')}
        right={
          files.length > 0 && <span className="muted">{t('count', { count: files.length })}</span>
        }
      />
      {files.length === 0 ? (
        <FileRowManual
          title={b.source === 'manual' && !b.sourceDocumentId ? t('byHandTitle') : t('none')}
          sub={
            b.source === 'manual' && !b.sourceDocumentId
              ? enteredBy
                ? t('byHandBy', { name: enteredBy, date: rc.date(b.createdAt) })
                : t('byHandOn', { date: rc.date(b.createdAt) })
              : ''
          }
        />
      ) : (
        files.map((f) => (
          <FileRow key={f.doc.id} file={fileRowFor(f, rc)}>
            <span className="flex flex-wrap items-center justify-end gap-2">
              <DocChip state="analysed" />
              <a
                href={`/api/documents/${f.doc.id}/file`}
                target="_blank"
                rel="noreferrer"
                className="btn btn-glass btn-sm"
              >
                {open[f.view]}
              </a>
              {f.canTurn && (
                <form action={rotateDocumentAction}>
                  <input type="hidden" name="id" value={f.doc.id} />
                  <input type="hidden" name="billId" value={b.id} />
                  <Button type="submit" variant="ghost" size="sm" icon="rotate">
                    {t('turn')}
                  </Button>
                </form>
              )}
            </span>
          </FileRow>
        ))
      )}
    </Card>
  );
}
