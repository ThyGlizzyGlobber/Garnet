import { notFound, redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { DocPaper } from '@/components/app/doc-paper';
import { Card, LinkButton } from '@/components/ui';
import { PageTitle, SectionHead } from '@/components/ui/blocks';
import { DocChip } from '@/components/ui/chip';
import { BackLink } from '@/components/ui/controls';
import { InlineAction } from '@/components/ui/form';
import { arrivalOf, fileView, memberNames } from '@/lib/bill-files';
import { pageContext } from '@/lib/context';
import { formatMinorPlain } from '@/lib/format';
import { getReviewItem, plainReason } from '@/lib/review';
import { addressOf, trustTarget } from '@/lib/sender-auth';
import { listServices } from '@/lib/services';
import { listUnits } from '@/lib/units';
import { matchService } from '@/ingest/pipeline';
import { readAsBillAction, reprocessDocumentAction } from '../actions';
import { ReviewForm } from './review-form';

/**
 * Confirming a document (§5): the document beside what was read from it,
 * the details that couldn't be read marked to check, then Create bill. A
 * receipt or notice says what it was instead, with "It's a bill" to insist.
 */
export default async function ReviewItemPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await pageContext();
  const { hh, me, date } = ctx;
  const t = await getTranslations('review');
  const tu = await getTranslations('ui');
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
  const waiting = d.status === 'needs_review' || d.status === 'unprocessed';
  // A receipt or provider notice: nothing to fill in, so say what happened instead.
  const isNotice = d.status === 'notice' || d.status === 'ignored';
  const missing = r
    ? [r.bill.amountMinor, r.bill.dueDate, r.bill.periodStart, r.bill.periodEnd].filter(
        (v) => v === null || v === undefined || v === '',
      ).length + (suggested ? 0 : 1)
    : 0;
  const failed = d.status === 'needs_review' && !r;
  const arrival = arrivalOf(hh.id, d, memberNames(hh.id));
  const how =
    arrival.kind === 'upload'
      ? arrival.name
        ? tu('how.uploadedBy', { name: arrival.name })
        : tu('how.upload')
      : arrival.kind === 'forward'
        ? tu('how.forward', { name: arrival.name ?? '' })
        : tu('how.email');
  const what = d.originalFilename ?? d.emailSubject ?? tu('doc.kind.document');
  const title = isNotice
    ? t('detail.noticeTitle')
    : failed
      ? tu('doc.failed')
      : d.status === 'unprocessed'
        ? tu('doc.waiting')
        : missing > 0
          ? t('confirm.title', { count: missing })
          : t('confirm.titleAll');
  const lede = `${what} · ${how} · ${date(d.receivedAt)}. ${
    isNotice
      ? d.status === 'ignored'
        ? t('detail.ignoredBody')
        : why.kind === 'text'
          ? why.text
          : t('detail.noticeBody')
      : failed
        ? t('confirm.failedLede')
        : missing > 0
          ? t('confirm.lede')
          : t('confirm.ledeAll')
  }`;

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
      read={!!r}
      noServiceMatch={!!r && !suggested}
      providerHint={r?.bill.provider ?? null}
      trustSender={d.senderVerified ? trustTarget(d.senderDomain, addressOf(d.emailFrom)) : null}
      canIgnore={waiting}
    />
  );

  return (
    <div className="scr form-scr">
      <BackLink href="/inbox">{t('title')}</BackLink>
      <PageTitle
        title={title}
        lede={lede}
        right={
          <InlineAction
            action={reprocessDocumentAction}
            hidden={{ documentId: d.id }}
            label={failed ? tu('doc.tryAgain') : t('detail.reprocess')}
            variant="secondary"
          />
        }
      />
      <div className="form-grid doc-grid">
        <div className="confirm-doc">
          <DocPaper doc={d} view={view} text={d.extraction?.textPreview ?? ''} />
        </div>
        {isNotice ? (
          <Card className="form-main">
            <SectionHead
              title={t('detail.noticeTitle')}
              right={<DocChip state={d.status === 'ignored' ? 'analysed' : 'analysed'} />}
            />
            <p className="muted">
              {d.status === 'ignored' ? t('detail.ignoredBody') : t('detail.noticeBody')}
            </p>
            <div className="form-acts">
              <InlineAction
                action={readAsBillAction}
                hidden={{ documentId: d.id }}
                label={t('detail.readAsBill')}
                variant="primary"
              />
              <LinkButton
                href={`/api/documents/${d.id}/file`}
                target="_blank"
                rel="noreferrer"
                variant="ghost"
                icon="eye"
              >
                {t('confirm.viewFile')}
              </LinkButton>
            </div>
            <p className="muted small">{t('detail.readAsBillHint')}</p>
            <details className="wiz-more">
              <summary className="link small">{t('detail.addAnyway')}</summary>
              {form}
            </details>
          </Card>
        ) : waiting ? (
          <Card>{form}</Card>
        ) : (
          <Card className="form-main">
            <p className="muted">{t('detail.alreadyBill')}</p>
          </Card>
        )}
      </div>
    </div>
  );
}
