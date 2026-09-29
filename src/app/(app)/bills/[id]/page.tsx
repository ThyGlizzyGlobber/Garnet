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
import { figureChanges } from '@/lib/consumption';
import { ChangeText } from '@/components/app/usage';
import { METRIC_KINDS } from '@/db/schema';
import { fullPaymentOpen, paysByInstalments } from '@/lib/instalments';
import {
  clearBillAlertAction,
  deleteBillAction,
  setPaymentPlanAction,
  toggleBillPaidAction,
  toggleInstalmentPaidAction,
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
  const byInstalments = paysByInstalments(b);
  const tp = await getTranslations('bills.plan');
  // Shares grouped per instalment when paying by instalments (one group otherwise).
  const shareGroups = [...new Set(b.shares.map((s) => s.instalment))].map((n) => ({
    n,
    instalment: b.instalments.find((i) => i.seq === n),
    shares: b.shares.filter((s) => s.instalment === n),
  }));
  const metrics = listBillMetrics(hh.id, b.id);
  const changes = metrics.length ? figureChanges(hh.id, b.id) : new Map();
  const tu = await getTranslations('usage');
  const words = (pct: number) => ({
    more: tu('more', { pct }),
    less: tu('less', { pct }),
    same: tu('same'),
  });
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
          <Row
            label={byInstalments ? tp('nextDue') : t('detail.dueDate')}
            value={date(b.dueDate)}
          />
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
          {!byInstalments && (
            <InlineAction
              action={toggleBillPaidAction}
              hidden={{ id: b.id, paid: b.paidToProviderAt ? 'false' : 'true' }}
              label={
                b.paidToProviderAt ? t('detail.markUnpaidProvider') : t('detail.markPaidProvider')
              }
            />
          )}
          <InlineAction
            action={deleteBillAction}
            hidden={{ id: b.id }}
            label={t('delete')}
            variant="danger"
            confirm={t('deleteConfirm')}
          />
        </div>
      </Card>

      {b.instalments.length > 0 && (
        <PaymentPlan
          bill={b}
          canChoose={me.role === 'owner' || b.service.payerMemberId === me.id}
          today={today}
          money={money}
          date={date}
          t={tp}
        />
      )}

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
            shareGroups.map((g) => (
              <div key={g.n}>
                {g.instalment && (
                  <h3 className="mt-4 text-xs font-semibold tracking-wide text-fg-muted uppercase">
                    {t('shares.instalment', { n: g.n, date: date(g.instalment.dueDate, 'short') })}
                  </h3>
                )}
                <ul className="mt-3 divide-y divide-border">
                  {g.shares.map((s) => {
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
              </div>
            ))
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
                      <dd className="shrink-0 text-right tabular-nums">
                        <span className="font-medium">{figure(m)}</span>
                        <ChangeText
                          className="block text-xs"
                          change={changes.get(m.id)}
                          words={words}
                          neutral={m.kind === 'average' || (m.amountMinor ?? 0) < 0}
                        />
                      </dd>
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

type Translate = (key: string, values?: Record<string, string | number>) => string;

/**
 * "How will you pay?": the notice's two options (in full, or by instalments),
 * which one the household chose, and each instalment's payment to the provider.
 */
function PaymentPlan({
  bill: b,
  canChoose,
  today,
  money,
  date,
  t,
}: {
  bill: NonNullable<ReturnType<typeof getBill>>;
  canChoose: boolean;
  today: string;
  money: (minor: number, currency?: string) => string;
  date: (iso: string | null | undefined, style?: 'short' | 'medium') => string;
  t: Translate;
}) {
  const chosen = b.paymentPlan;
  const current = chosen ?? 'full';
  const count = b.instalments.length;
  const total = b.instalments.reduce((s, i) => s + i.amountMinor, 0);
  // Paid in order: mark the next one paid, or undo the last one paid.
  const nextSeq = b.instalments.find((i) => !i.paidToProviderAt)?.seq;
  const lastPaidSeq = b.instalments.filter((i) => i.paidToProviderAt).at(-1)?.seq;
  // Paying in full is only on offer until the notice's pay-in-full date.
  const fullOpen = fullPaymentOpen(b, today);
  const lock = b.shares.some((s) => s.paidAt && s.paidMethod !== 'payer')
    ? t('lockedShares')
    : b.paidToProviderAt || b.instalments.some((i) => i.paidToProviderAt)
      ? t('lockedProvider')
      : null;
  const option = (plan: 'full' | 'instalments') => {
    const isChosen = chosen === plan;
    const closed = plan === 'full' && !fullOpen && !isChosen;
    return `flex flex-col gap-2 rounded-2xl border p-4 ${
      isChosen ? 'border-accent bg-accent-soft' : 'border-border-strong bg-surface-2'
    } ${closed ? 'opacity-60' : ''}`;
  };
  const choose = (plan: 'full' | 'instalments') =>
    canChoose &&
    chosen !== plan &&
    !(lock && current !== plan) &&
    (plan === 'instalments' || fullOpen) ? (
      <div className="mt-auto pt-1">
        <InlineAction
          action={setPaymentPlanAction}
          hidden={{ id: b.id, plan }}
          label={t('choose')}
          variant={chosen === null ? 'primary' : 'secondary'}
        />
      </div>
    ) : null;
  return (
    <Card className="mt-4 scroll-mt-24" id="plan">
      <h2 className="font-semibold">{t('title')}</h2>
      <p className="mt-0.5 text-xs text-fg-muted">
        {chosen === null
          ? fullOpen
            ? t('undecided', { count })
            : t('undecidedClosed', { count, date: date(b.fullDueDate) })
          : chosen === 'full'
            ? t('chosenFull')
            : t('chosenInstalments', { count })}
        {chosen === null && !canChoose && ` ${t('whoChooses', { service: b.service.name })}`}
      </p>
      <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_1.4fr]">
        <div className={option('full')}>
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-semibold">{t('full')}</p>
            {chosen === 'full' && <Badge tone="success">{t('chosen')}</Badge>}
          </div>
          <p className="font-display text-2xl font-semibold tabular-nums">
            {money(b.fullAmountMinor ?? b.amountMinor, b.currency)}
          </p>
          <p className="text-xs text-fg-muted">
            {fullOpen || chosen === 'full'
              ? t('fullBy', { date: date(b.fullDueDate ?? b.dueDate) })
              : t('fullClosed', { date: date(b.fullDueDate) })}
          </p>
          {choose('full')}
        </div>
        <div className={option('instalments')}>
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-semibold">{t('instalments', { count })}</p>
            {chosen === 'instalments' && <Badge tone="success">{t('chosen')}</Badge>}
          </div>
          <ul className="divide-y divide-border text-sm">
            {b.instalments.map((i) => {
              const late = !i.paidToProviderAt && i.dueDate < today;
              return (
                <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span className="flex flex-col">
                    <span className="font-medium">{t('ordinal', { n: i.seq })}</span>
                    <span className="flex flex-wrap items-center gap-2 text-xs text-fg-muted">
                      {date(i.dueDate)}
                      {chosen === 'instalments' &&
                        (i.paidToProviderAt ? (
                          <Badge tone="success">
                            {t('paidOn', { date: date(i.paidToProviderAt, 'short') })}
                          </Badge>
                        ) : late ? (
                          <Badge tone="danger">{t('overdue')}</Badge>
                        ) : null)}
                    </span>
                  </span>
                  <span className="font-semibold tabular-nums">
                    {money(i.amountMinor, b.currency)}
                  </span>
                  {chosen === 'instalments' && (i.seq === nextSeq || i.seq === lastPaidSeq) && (
                    <div className="basis-full">
                      <InlineAction
                        action={toggleInstalmentPaidAction}
                        hidden={{
                          id: b.id,
                          seq: String(i.seq),
                          paid: i.paidToProviderAt ? 'false' : 'true',
                        }}
                        label={
                          i.paidToProviderAt
                            ? t('undo')
                            : t('markPaid', { provider: b.service.provider })
                        }
                        variant={i.paidToProviderAt ? 'ghost' : 'secondary'}
                      />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
          <p className="text-xs text-fg-muted">
            {t('total', { amount: money(total, b.currency) })}
          </p>
          {choose('instalments')}
        </div>
      </div>
      {canChoose && chosen === 'instalments' && !fullOpen ? (
        <p className="mt-3 text-xs text-fg-muted">
          {t('lockedDate', { date: date(b.fullDueDate) })}
        </p>
      ) : (
        lock && canChoose && <p className="mt-3 text-xs text-fg-muted">{lock}</p>
      )}
    </Card>
  );
}
