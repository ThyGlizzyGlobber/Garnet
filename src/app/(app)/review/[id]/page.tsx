import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { Badge, Card, LinkButton, PageHeader } from '@/components/ui';
import { InlineAction } from '@/components/ui/form';
import { pageContext } from '@/lib/context';
import { minorUnitDigits } from '@/lib/format';
import { getReviewItem } from '@/lib/review';
import { listServices } from '@/lib/services';
import { listUnits } from '@/lib/units';
import { matchService } from '@/ingest/pipeline';
import { ignoreDocumentAction, reprocessDocumentAction } from '../actions';
import { ReviewForm } from './review-form';
import { addressOf, trustTarget } from '@/lib/sender-auth';

export default async function ReviewItemPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { hh, date } = await pageContext();
  const t = await getTranslations('review');
  const d = getReviewItem(hh.id, id);
  if (!d) notFound();
  const r = d.extraction?.result ?? null;
  const services = listServices(hh.id);
  const digits = minorUnitDigits(r?.bill.currency ?? hh.currency);
  const major = (m: number | null | undefined) =>
    m === null || m === undefined ? '' : (m / 10 ** digits).toFixed(digits);
  const suggested = r ? (r.bill.serviceId ?? matchService(hh.id, r)) : null;
  const isPdf = (d.mimeType ?? '').includes('pdf') || d.path.endsWith('.pdf');
  const canReview = d.status !== 'extracted';
  // A receipt or provider notice: nothing to fill in, so say what happened instead.
  const isNotice = d.status === 'notice';
  const relatedBill = d.billId ?? d.extraction?.billId ?? null;

  const form = (
    <ReviewForm
      documentId={d.id}
      services={services.map((s) => ({
        id: s.id,
        name: s.name,
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
        action={
          relatedBill && !isNotice ? (
            <LinkButton href={`/bills/${relatedBill}`} variant="secondary">
              {t('detail.viewBill')}
            </LinkButton>
          ) : undefined
        }
      />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Badge
          tone={
            d.status === 'needs_review'
              ? 'warning'
              : d.status === 'extracted'
                ? 'success'
                : 'neutral'
          }
        >
          {t(`status.${d.status}`)}
        </Badge>
        {d.extraction?.reason && !isNotice && (
          <span className="text-sm text-fg-muted">{d.extraction.reason}</span>
        )}
        {r && (
          <Badge tone={r.confidence >= 0.85 ? 'success' : 'warning'}>
            {t('detail.confidence', {
              pct: Math.round(r.confidence * 100),
              extractor: r.extractor,
            })}
          </Badge>
        )}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card
          className={`min-h-[60vh] overflow-hidden p-0 ${isNotice ? 'order-2 lg:order-none' : ''}`}
        >
          {isPdf ? (
            <iframe
              src={`/api/documents/${d.id}/file`}
              title={d.originalFilename ?? 'document'}
              className="h-[75vh] w-full"
            />
          ) : (
            <pre className="max-h-[75vh] overflow-auto p-4 text-xs whitespace-pre-wrap">
              {d.extraction?.textPreview || t('detail.noPreview')}
            </pre>
          )}
        </Card>
        <div className={`flex flex-col gap-4 ${isNotice ? 'order-1 lg:order-none' : ''}`}>
          {r && r.warnings.length > 0 && (
            <Card className="text-sm">
              <p className="font-semibold">{t('detail.warnings')}</p>
              <ul className="mt-1 list-disc pl-5 text-fg-muted">
                {r.warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </Card>
          )}
          {isNotice ? (
            <>
              <Card className="flex flex-col gap-3">
                <p className="font-display text-lg font-semibold">{t('detail.noticeTitle')}</p>
                {d.extraction?.reason && <p className="text-sm">{d.extraction.reason}.</p>}
                <p className="text-sm text-fg-muted">{t('detail.noticeBody')}</p>
                {relatedBill && (
                  <div>
                    <LinkButton href={`/bills/${relatedBill}`}>{t('detail.noticeBill')}</LinkButton>
                  </div>
                )}
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
            {d.status !== 'ignored' && (
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
          {d.extraction?.attempts && d.extraction.attempts.length > 0 && (
            <Card className="text-xs text-fg-muted">
              <p className="font-semibold text-fg">{t('detail.attempts')}</p>
              <ul className="mt-1">
                {d.extraction.attempts.map((a, i) => (
                  <li key={i}>
                    {a.extractor}:{' '}
                    {a.error
                      ? t('detail.attemptError', { error: a.error })
                      : a.confidence === null
                        ? t('detail.attemptNone')
                        : `${Math.round(a.confidence * 100)}%`}
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
