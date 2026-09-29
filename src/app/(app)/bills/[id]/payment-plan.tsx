import { getTranslations } from 'next-intl/server';
import { Badge, Card } from '@/components/ui';
import { InlineAction } from '@/components/ui/form';
import type { BillDetail } from '@/lib/bills';
import type { PageContext } from '@/lib/context';
import { fullPaymentOpen, planLock } from '@/lib/instalments';
import { setPaymentPlanAction, toggleInstalmentPaidAction } from '../actions';

/**
 * "How will you pay?": the notice's two options (in full, or by instalments),
 * which one the household chose, and each instalment's payment to the provider.
 */
export async function PaymentPlan({
  bill: b,
  canChoose,
  ctx,
}: {
  bill: BillDetail;
  canChoose: boolean;
  ctx: PageContext;
}) {
  const t = await getTranslations('bills.plan');
  const { money, date, today } = ctx;
  const chosen = b.paymentPlan;
  const current = chosen ?? 'full';
  const count = b.instalments.length;
  const total = b.instalments.reduce((s, i) => s + i.amountMinor, 0);
  // Paid in order: mark the next one paid, or undo the last one paid.
  const nextSeq = b.instalments.find((i) => !i.paidToProviderAt)?.seq;
  const lastPaidSeq = b.instalments.filter((i) => i.paidToProviderAt).at(-1)?.seq;
  // Paying in full is only on offer until the notice's pay-in-full date.
  const fullOpen = fullPaymentOpen(b, today);
  const locked = planLock(b);
  const lock =
    locked === 'shares' ? t('lockedShares') : locked === 'provider' ? t('lockedProvider') : null;
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
