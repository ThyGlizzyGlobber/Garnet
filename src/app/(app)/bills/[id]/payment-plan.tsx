import { getTranslations } from 'next-intl/server';
import { Button, Card } from '@/components/ui';
import { SectionHead, Timeline, type TimelineStep } from '@/components/ui/blocks';
import { Chip } from '@/components/ui/chip';
import type { BillDetail } from '@/lib/bills';
import type { PageContext } from '@/lib/context';
import { fullPaymentOpen, planLock } from '@/lib/instalments';
import { setPaymentPlanAction, toggleInstalmentPaidAction } from '../actions';

/**
 * "How you're paying": the notice's instalments as a timeline (paid ones
 * ticked, the next one ringed), whether paying in full is still open, and
 * the switch between the two for whoever may choose.
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
  const count = b.instalments.length;
  const total = b.instalments.reduce((s, i) => s + i.amountMinor, 0);
  const nextSeq = b.instalments.find((i) => !i.paidToProviderAt)?.seq;
  const lastPaidSeq = b.instalments.filter((i) => i.paidToProviderAt).at(-1)?.seq;
  const fullOpen = fullPaymentOpen(b, today);
  const locked = planLock(b);
  const lock =
    locked === 'shares' ? t('lockedShares') : locked === 'provider' ? t('lockedProvider') : null;
  const steps: TimelineStep[] = b.instalments.map((i) => ({
    title: t('ordinal', { n: i.seq }),
    sub: i.paidToProviderAt
      ? t('paidOn', { date: date(i.paidToProviderAt, 'short') })
      : !i.paidToProviderAt && i.dueDate < today && chosen === 'instalments'
        ? `${t('overdue')} · ${date(i.dueDate)}`
        : t('dueOn', { date: date(i.dueDate) }),
    amount: money(i.amountMinor, b.currency),
    state: i.paidToProviderAt ? 'done' : i.seq === nextSeq ? 'next' : 'later',
  }));
  const canSwitchTo = (plan: 'full' | 'instalments') =>
    canChoose && chosen !== plan && !lock && (plan === 'instalments' || fullOpen);
  return (
    <Card id="plan" className="scroll-mt-24">
      <SectionHead
        title={chosen === null ? t('title') : t('titleChosen')}
        right={
          chosen === 'instalments' ? (
            <Chip tone="info" icon="repeat">
              {t('byInstalments')}
            </Chip>
          ) : chosen === 'full' ? (
            <Chip tone="neutral" icon="check">
              {t('full')}
            </Chip>
          ) : (
            <Chip tone="warn" icon="clock">
              {t('undecidedChip')}
            </Chip>
          )
        }
      />
      <p className="muted small mb-3">
        {chosen === null
          ? fullOpen
            ? t('undecided', { count })
            : t('undecidedClosed', { count, date: date(b.fullDueDate) })
          : chosen === 'full'
            ? t('chosenFull')
            : t('chosenInstalments', { count })}
        {chosen === null && !canChoose && ` ${t('whoChooses', { service: b.service.name })}`}
      </p>
      <Timeline steps={steps} />
      <p className="muted small mt-2">
        {t('total', { amount: money(total, b.currency) })} ·{' '}
        {fullOpen
          ? t('fullOpenUntil', {
              amount: money(b.fullAmountMinor ?? b.amountMinor, b.currency),
              date: date(b.fullDueDate ?? b.dueDate),
            })
          : t('fullClosedOn', {
              amount: money(b.fullAmountMinor ?? b.amountMinor, b.currency),
              date: date(b.fullDueDate),
            })}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {canSwitchTo('instalments') && (
          <form action={setPaymentPlanAction}>
            <input type="hidden" name="id" value={b.id} />
            <input type="hidden" name="plan" value="instalments" />
            <Button
              type="submit"
              size="sm"
              variant={chosen === null ? 'primary' : 'secondary'}
              icon="repeat"
            >
              {t('payByInstalments', { count })}
            </Button>
          </form>
        )}
        {canSwitchTo('full') && (
          <form action={setPaymentPlanAction}>
            <input type="hidden" name="id" value={b.id} />
            <input type="hidden" name="plan" value="full" />
            <Button
              type="submit"
              size="sm"
              variant={chosen === null ? 'primary' : 'secondary'}
              icon="check"
            >
              {t('payInFull')}
            </Button>
          </form>
        )}
        {chosen === 'instalments' && nextSeq && (
          <form action={toggleInstalmentPaidAction}>
            <input type="hidden" name="id" value={b.id} />
            <input type="hidden" name="seq" value={String(nextSeq)} />
            <input type="hidden" name="paid" value="true" />
            <Button type="submit" size="sm" variant="secondary" icon="check">
              {t('markNext', { n: nextSeq, provider: b.service.provider })}
            </Button>
          </form>
        )}
        {chosen === 'instalments' && lastPaidSeq && (
          <form action={toggleInstalmentPaidAction}>
            <input type="hidden" name="id" value={b.id} />
            <input type="hidden" name="seq" value={String(lastPaidSeq)} />
            <input type="hidden" name="paid" value="false" />
            <Button type="submit" size="sm" variant="ghost">
              {t('undoLast', { n: lastPaidSeq })}
            </Button>
          </form>
        )}
      </div>
      {canChoose && chosen === 'instalments' && !fullOpen ? (
        <p className="muted small mt-3">{t('lockedDate', { date: date(b.fullDueDate) })}</p>
      ) : (
        lock && canChoose && <p className="muted small mt-3">{lock}</p>
      )}
    </Card>
  );
}
