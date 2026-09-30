import { notFound, redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { Badge, Card, PageHeader } from '@/components/ui';
import { InlineAction } from '@/components/ui/form';
import { pageContext } from '@/lib/context';
import { fileView } from '@/lib/bill-files';
import { formatMinorPlain } from '@/lib/format';
import { getReviewItem, plainReason, STATUS_TONE } from '@/lib/review';
import { listServices } from '@/lib/services';
import { listUnits } from '@/lib/units';
import { matchService } from '@/ingest/pipeline';
import { ignoreDocumentAction, readAsBillAction, reprocessDocumentAction } from '../actions';
import { ReviewForm } from './review-form';
import { addressOf, trustTarget } from '@/lib/sender-auth';

export default async function ReviewItemPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { hh, me, date } = await pageContext();
  const t = await getTranslations('review');
  const d = getReviewItem(hh.id, id, undefined, { viewer: me.id });
  if (!d) notFound();
  // One page per bill: its file, receipts and notices all open the bill.
  if (d.linkedBillId) redirect(`/bills/${d.linkedBillId}#files`);
  const why = plainReason(d.extraction);
  const r = d.extraction?.result ?? null;
  const services = listServices(hh.id, { viewer: me.id });
  const tb = await getTranslations('bills');
  // Amounts as the form's inputs expect them ("129.00").
  const major = (m: number | null | undefined) =>
    m === null || m === undefined ? '' : formatMinorPlain(m, r?.bill.currency ?? hh.currency);
  const suggested = r
    ? (r.bill.serviceId ?? matchService(hh.id, r, undefined, { viewer: me.id }))
    : null;
  const view = fileView(d);
  const canReview = d.status !== 'extracted';
  // A receipt or provider notice: nothing to fill in, so say what happened instead.
  const isNotice = d.status === 'notice' || d.status === 'ignored';

  const form = (
    <ReviewForm
      documentId={d.id}
      services={services.map((s) => ({
        id: s.id,
        name: s.ownerMemberId ? `${s.name} · ${tb('tile.onlyYou')}` : s.name,
        provider: s.provider,
        usageUnit: s.usageUnit,
      }))}
      units={listUnits().map((u) => ({ key: u.key, label: u.label }))}
      currency={r?.bill.currency ?? hh.currency}
      initial={{
        serviceId: suggested ?? services[0]?.id ?? '',
        amount: major(r?.bill.amountMinor),
        tax: major(r?.bill.taxMinor),
        taxLabel: r?.bill.taxLabel ?? '',
        periodStart: r?.bill.periodStart ?? '',
        periodEnd: r?.bill.periodEnd ?? '',
        issueDate: r?.bill.issueDate ?? '',
        dueDate: r?.bill.dueDate ?? '',
        usageQuantity: r?.bill.usageQuantity?.toString() ?? '',
        usageUnit: r?.bill.usageUnit ?? '',
        externalRef: r?.bill.externalRef ?? '',
        notes: '',
      }}
      noServiceMatch={!!r && !suggested}
      providerHint={r?.bill.provider ?? null}
      trustSender={d.senderVerified ? trustTarget(d.senderDomain, addressOf(d.emailFrom)) : null}
    />
  );

  return (
    <>
      <PageHeader
        title={
          r
            ? `${r.bill.provider} · ${r.bill.serviceType}`
            : (d.originalFilename ?? t('detail.untitled'))
        }
        subtitle={`${t(`kind.${d.kind}`)} · ${date(d.receivedAt)}${d.emailFrom ? ` · ${d.emailFrom}` : ''}`}
      />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Badge tone={STATUS_TONE[d.status]}>{t(`status.${d.status}`)}</Badge>
        {why.kind !== 'none' && !isNotice && (
          <span className="text-sm text-fg-muted">
            {why.kind === 'check' ? t('why.check') : why.text}
          </span>
        )}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card
          className={`min-h-[60vh] overflow-hidden p-0 ${isNotice ? 'order-2 lg:order-none' : ''}`}
        >
          {view === 'pdf' ? (
            <iframe
              src={`/api/documents/${d.id}/file`}
              title={d.originalFilename ?? t('detail.untitledDocument')}
              className="h-[75vh] w-full"
            />
          ) : view === 'photo' ? (
            // eslint-disable-next-line @next/next/no-img-element -- archived file, served as-is
            <img
              src={`/api/documents/${d.id}/file`}
              alt={d.originalFilename ?? t('detail.untitledPhoto')}
              className="max-h-[75vh] w-full object-contain"
            />
          ) : (
            <pre className="max-h-[75vh] overflow-auto p-4 text-xs whitespace-pre-wrap">
              {d.extraction?.textPreview || t('detail.noPreview')}
            </pre>
          )}
        </Card>
        <div className={`flex flex-col gap-4 ${isNotice ? 'order-1 lg:order-none' : ''}`}>
          {isNotice ? (
            <>
              <Card className="flex flex-col gap-3">
                <p className="font-display text-lg font-semibold">{t('detail.noticeTitle')}</p>
                {d.status === 'notice' && why.kind === 'text' && (
                  <p className="text-sm">{why.text}.</p>
                )}
                <p className="text-sm text-fg-muted">
                  {d.status === 'ignored' ? t('detail.ignoredBody') : t('detail.noticeBody')}
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <InlineAction
                    action={readAsBillAction}
                    hidden={{ documentId: d.id }}
                    label={t('detail.readAsBill')}
                  />
                </div>
                <p className="text-xs text-fg-muted">{t('detail.readAsBillHint')}</p>
              </Card>
              <details className="group">
                <summary className="cursor-pointer text-sm font-semibold text-accent">
                  {t('detail.addAnyway')}
                </summary>
                <div className="mt-3">{form}</div>
              </details>
            </>
          ) : canReview ? (
            form
          ) : (
            <Card className="text-sm text-fg-muted">{t('detail.alreadyBill')}</Card>
          )}
          <div className="flex flex-wrap gap-2">
            <InlineAction
              action={reprocessDocumentAction}
              hidden={{ documentId: d.id }}
              label={t('detail.reprocess')}
              variant="secondary"
            />
            {(d.status === 'needs_review' || d.status === 'unprocessed') && (
              <InlineAction
                action={ignoreDocumentAction}
                hidden={{ documentId: d.id }}
                label={t('detail.ignore')}
                variant="danger"
                confirm={t('detail.ignoreConfirm')}
              />
            )}
            <a
              href={`/api/documents/${d.id}/file`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center rounded-full px-4 py-2 text-sm font-semibold text-accent hover:bg-surface-2"
            >
              {t('detail.openFile')}
            </a>
          </div>
        </div>
      </div>
    </>
  );
}
