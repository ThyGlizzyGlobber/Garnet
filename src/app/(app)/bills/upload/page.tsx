import { getTranslations } from 'next-intl/server';
import { Card, LinkButton } from '@/components/ui';
import { AddressCard, PageTitle, SectionHead } from '@/components/ui/blocks';
import { Chip, DocChip } from '@/components/ui/chip';
import { BackLink } from '@/components/ui/controls';
import { DocIcon } from '@/components/ui/rows';
import { billsAddress } from '@/lib/bills-address';
import { getBill } from '@/lib/bills';
import { billDue } from '@/lib/bill-status';
import { fileView } from '@/lib/bill-files';
import { pageContext } from '@/lib/context';
import { isLlmConfigured } from '@/lib/env';
import { listDocuments } from '@/lib/review';
import { UploadForm } from './upload-form';

/**
 * Upload a bill: the drop zone, what this member uploaded lately and how it
 * went (analysed and filed, still being read, a detail to confirm), and the
 * bills address for next time.
 */
export default async function UploadPage() {
  const ctx = await pageContext();
  const { hh, me, money, date } = ctx;
  const t = await getTranslations('upload');
  const tu = await getTranslations('ui');
  const tn = await getTranslations('nav');
  const address = billsAddress(hh);
  const recent = listDocuments(hh.id, { viewer: me.id })
    .filter((d) => d.kind === 'upload' && d.memberId === me.id)
    .sort((a, b) => b.receivedAt.localeCompare(a.receivedAt))
    .slice(0, 8);
  return (
    <div className="scr form-scr narrow">
      <BackLink href="/bills">{tn('bills')}</BackLink>
      <PageTitle title={t('title')} lede={isLlmConfigured() ? t('lede') : t('ledeNoLlm')} />
      <UploadForm />
      {recent.length > 0 && (
        <Card>
          <SectionHead title={t('justNow')} />
          <div className="rows">
            {recent.map((d) => {
              const bill = d.billId ? getBill(hh.id, d.billId) : null;
              const view = fileView(d);
              const needs =
                d.status === 'needs_review' && d.extraction?.result
                  ? Object.values({
                      amount: d.extraction.result.bill.amountMinor,
                      due: d.extraction.result.bill.dueDate,
                      from: d.extraction.result.bill.periodStart,
                      to: d.extraction.result.bill.periodEnd,
                    }).filter((v) => v === null || v === undefined || v === '').length
                  : 0;
              const state =
                d.status === 'unprocessed'
                  ? 'waiting'
                  : d.status === 'needs_review' && !d.extraction?.result
                    ? 'failed'
                    : 'analysed';
              return (
                <div key={d.id} className="up-item">
                  <DocIcon type={view} />
                  <span className="up-t">
                    <b>{d.originalFilename ?? tu('doc.kind.document')}</b>
                    <span className="muted small">
                      {t('uploaded', {
                        when: d.arrived === ctx.today ? t('today') : date(d.receivedAt),
                      })}
                    </span>
                    <span className="up-state">
                      {state === 'waiting' ? (
                        <span className="analysing">
                          <i />
                          {t('analysing')}
                        </span>
                      ) : (
                        <DocChip state={state} />
                      )}
                      {bill && (
                        <span className="up-to">
                          {bill.service.name} ·{' '}
                          {money(billDue(bill, ctx.today).amountMinor, bill.currency)}
                        </span>
                      )}
                      {needs > 0 && (
                        <Chip tone="warn" icon="pencil">
                          {tu('doc.toConfirm', { count: needs })}
                        </Chip>
                      )}
                      {state === 'failed' && <span className="muted small">{t('failed')}</span>}
                    </span>
                  </span>
                  {bill ? (
                    <LinkButton href={`/bills/${bill.id}`} variant="secondary" size="sm">
                      {t('openBill')}
                    </LinkButton>
                  ) : d.status === 'needs_review' ? (
                    <LinkButton href={`/inbox/${d.id}`} size="sm">
                      {state === 'failed' ? tu('doc.tryAgain') : t('confirm')}
                    </LinkButton>
                  ) : (
                    <span />
                  )}
                </div>
              );
            })}
          </div>
        </Card>
      )}
      {address && (
        <Card className="d3-addr">
          <AddressCard label={t('forwardTo')} address={address} />
        </Card>
      )}
    </div>
  );
}
