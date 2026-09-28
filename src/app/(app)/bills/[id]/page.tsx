import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { Badge, Card, LinkButton, PageHeader } from '@/components/ui';
import { InlineAction } from '@/components/ui/form';
import { getBill } from '@/lib/bills';
import { pageContext } from '@/lib/context';
import { formatMoney } from '@/lib/format';
import { unitLabel } from '@/lib/units';
import { listBillMetrics } from '@/lib/metrics';
import { METRIC_KINDS } from '@/db/schema';
import {
  clearBillAlertAction,
  deleteBillAction,
  toggleBillPaidAction,
  toggleSharePaidAction,
} from '../actions';

export default async function BillPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { hh, me, money, date, today } = await pageContext();
  const t = await getTranslations('bills');
  const b = getBill(hh.id, id);
  if (!b) notFound();
  const overdue = !b.paidToProviderAt && b.dueDate < today;
  const payer = b.shares.find((s) => s.paidMethod === 'payer')?.member;
  const metrics = listBillMetrics(hh.id, b.id);
  const number = new Intl.NumberFormat(hh.locale, { maximumFractionDigits: 4 });
  const figure = (m: (typeof metrics)[number]) =>
    m.amountMinor !== null
      ? money(m.amountMinor, m.currency ?? b.currency)
      : `${number.format(m.value ?? 0)}${m.unit ? ` ${unitLabel(m.unit)}` : ''}`;

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title={`${b.service.name} · ${b.service.provider}`}
        subtitle={`${date(b.periodStart)} – ${date(b.periodEnd)}`}
        action={
          <LinkButton href={`/bills/${b.id}/edit`} variant="secondary">
            {t('edit')}
          </LinkButton>
        }
      />
      {b.alertKind && (
        <Card className="mb-4 flex flex-col gap-3 border-danger/40 bg-danger-soft">
          <p className="font-semibold text-danger">{t(`alert.${b.alertKind}`)}</p>
          <p className="text-sm">
            {t(`alert.${b.alertKind}Body`, {
              provider: b.service.provider,
              date: b.alertAt ? date(b.alertAt) : '',
            })}
          </p>
          <div className="flex flex-wrap items-center gap-3">
            {b.alertDocumentId && (
              <Link
                href={`/review/${b.alertDocumentId}`}
                className="text-sm font-semibold text-accent"
              >
                {t('alert.viewEmail')} →
              </Link>
            )}
            <InlineAction
              action={clearBillAlertAction}
              hidden={{ id: b.id }}
              label={t('alert.resolve')}
              variant="secondary"
            />
          </div>
        </Card>
      )}
      <Card>
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm text-fg-muted">{t('detail.amount')}</p>
            <p className="text-3xl font-semibold tabular-nums">
              {money(b.amountMinor, b.currency)}
            </p>
            {b.taxMinor !== null && (
              <p className="text-xs text-fg-muted">
                {t('detail.includesTax', {
                  amount: money(b.taxMinor, b.currency),
                  label: b.taxLabel ?? t('detail.tax'),
                })}
              </p>
            )}
          </div>
          <div className="flex flex-col items-end gap-2">
            {b.paidToProviderAt ? (
              <Badge tone="success">{t('detail.paidToProvider')}</Badge>
            ) : overdue ? (
              <Badge tone="danger">{t('overdue')}</Badge>
            ) : (
              <Badge tone="warning">{t('detail.unpaid')}</Badge>
            )}
            <Badge>{t(`source.${b.source}`)}</Badge>
            {b.isAnomaly && <Badge tone="warning">{t('anomaly')}</Badge>}
          </div>
        </div>
        <dl className="mt-5 grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-3">
          <Row label={t('detail.dueDate')} value={date(b.dueDate)} />
          <Row label={t('detail.issueDate')} value={date(b.issueDate) || '—'} />
          <Row label={t('detail.externalRef')} value={b.externalRef ?? '—'} />
          <Row
            label={t('detail.usage')}
            value={b.usageQuantity !== null ? `${b.usageQuantity} ${unitLabel(b.usageUnit)}` : '—'}
          />
          <Row label={t('detail.account')} value={b.service.accountRef ?? '—'} />
          <Row label={t('detail.paidToProviderAt')} value={date(b.paidToProviderAt) || '—'} />
          {b.sourceDocumentId && (
            <div>
              <dt className="text-fg-muted">{t('detail.sourceDocument')}</dt>
              <dd>
                <Link href={`/review/${b.sourceDocumentId}`} className="font-medium text-accent">
                  {t('detail.viewSource')}
                </Link>
              </dd>
            </div>
          )}
        </dl>
        {b.isAnomaly && b.anomalyNote && (
          <p className="mt-4 rounded-xl bg-warning/10 px-4 py-3 text-sm text-warning">
            {b.anomalyNote}
          </p>
        )}
        {b.notes && <p className="mt-4 whitespace-pre-wrap text-sm text-fg-muted">{b.notes}</p>}
        <div className="mt-5 flex flex-wrap gap-2">
          <InlineAction
            action={toggleBillPaidAction}
            hidden={{ id: b.id, paid: b.paidToProviderAt ? 'false' : 'true' }}
            label={
              b.paidToProviderAt ? t('detail.markUnpaidProvider') : t('detail.markPaidProvider')
            }
          />
          <InlineAction
            action={deleteBillAction}
            hidden={{ id: b.id }}
            label={t('delete')}
            variant="danger"
            confirm={t('deleteConfirm')}
          />
        </div>
      </Card>

      {hh.splitMode === 'shared' && (
        <Card className="mt-4">
          <h2 className="font-semibold">{t('shares.title')}</h2>
          {payer && (
            <p className="mt-0.5 text-xs text-fg-muted">
              {t('shares.payerNote', { name: payer.name })}
            </p>
          )}
          {b.shares.length === 0 ? (
            <p className="mt-3 text-sm text-fg-muted">{t('shares.none')}</p>
          ) : (
            <ul className="mt-3 divide-y divide-border">
              {b.shares.map((s) => {
                const mine = s.memberId === me.id;
                const prorated = s.basisDays !== s.periodDays;
                return (
                  <li key={s.id} className="flex items-center justify-between gap-3 py-3">
                    <div className="flex items-center gap-3">
                      <span
                        className="size-3 rounded-full"
                        style={{ background: s.member.colour }}
                      />
                      <div>
                        <p className="font-medium">
                          {s.member.name}{' '}
                          {mine && (
                            <span className="text-xs text-fg-muted">({t('shares.you')})</span>
                          )}
                        </p>
                        <p className="text-xs text-fg-muted">
                          {s.paidAt
                            ? s.paidMethod === 'payer'
                              ? t('shares.paidProvider')
                              : t('shares.paidOn', { date: date(s.paidAt, 'short') })
                            : s.paymentReference
                              ? t('shares.ref', { ref: s.paymentReference })
                              : t('shares.unpaid')}
                          {prorated &&
                            ` · ${t('shares.prorated', { days: s.basisDays, total: s.periodDays })}`}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-semibold tabular-nums">
                        {formatMoney(s.amountMinor, s.currency, hh.locale)}
                      </span>
                      {s.paidMethod !== 'payer' && (
                        <InlineAction
                          action={toggleSharePaidAction}
                          hidden={{
                            shareId: s.id,
                            billId: b.id,
                            paid: s.paidAt ? 'false' : 'true',
                          }}
                          label={s.paidAt ? t('shares.markUnpaid') : t('shares.markPaid')}
                          variant={s.paidAt ? 'ghost' : 'primary'}
                        />
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          {payer && payer.paymentDetails.length > 0 && (
            <div className="mt-3 rounded-xl bg-surface-2 p-3 text-xs">
              <p className="font-semibold">{t('shares.payTo', { name: payer.name })}</p>
              {payer.paymentDetails.map((d) => (
                <p key={d.label} className="text-fg-muted">
                  {d.label}: <span className="font-medium text-fg">{d.value}</span>
                </p>
              ))}
            </div>
          )}
        </Card>
      )}

      {metrics.length > 0 && (
        <Card className="mt-4">
          <h2 className="font-semibold">{t('metrics.title')}</h2>
          <p className="mt-0.5 text-xs text-fg-muted">{t('metrics.body')}</p>
          {METRIC_KINDS.filter((k) => metrics.some((m) => m.kind === k)).map((kind) => (
            <div key={kind} className="mt-4">
              <h3 className="text-xs font-semibold tracking-wide text-fg-muted uppercase">
                {t(`metrics.kind.${kind}`)}
              </h3>
              <dl className="mt-1 divide-y divide-border text-sm">
                {metrics
                  .filter((m) => m.kind === kind)
                  .map((m) => (
                    <div key={m.id} className="flex items-baseline justify-between gap-4 py-1.5">
                      <dt className="min-w-0">
                        {m.label}
                        {m.periodStart && m.periodEnd && (
                          <span className="ml-1 text-xs text-fg-muted">
                            {date(m.periodStart, 'short')} – {date(m.periodEnd, 'short')}
                          </span>
                        )}
                      </dt>
                      <dd className="shrink-0 font-medium tabular-nums">{figure(m)}</dd>
                    </div>
                  ))}
              </dl>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-fg-muted">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}
