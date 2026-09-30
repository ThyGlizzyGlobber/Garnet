import { getTranslations } from 'next-intl/server';
import { StackBar } from '@/components/charts/stack-bar';
import { Button, Card } from '@/components/ui';
import { SectionHead } from '@/components/ui/blocks';
import { ShareRow, type ShareRowModel } from '@/components/ui/rows';
import type { BillDetail } from '@/lib/bills';
import type { PageContext } from '@/lib/context';
import { splitView } from '@/lib/split-view';
import { toggleSharePaidAction } from '../actions';

/**
 * "Split": each person's part of the bill as a bar and a row (for the
 * instalment due next when paying by instalments), with who has paid the
 * payer back, and how to pay them.
 */
export async function SharesCard({ bill: b, ctx }: { bill: BillDetail; ctx: PageContext }) {
  const t = await getTranslations('bills.shares');
  const tsp = await getTranslations('services.split');
  const { me, money, date, today } = ctx;
  const payer = b.shares.find((s) => s.paidMethod === 'payer')?.member;
  const byInstalments = b.paymentPlan === 'instalments' && b.instalments.length > 0;
  const next = byInstalments
    ? (b.instalments.find((i) => !i.paidToProviderAt) ?? b.instalments.at(-1)!)
    : null;
  const shown = byInstalments ? b.shares.filter((s) => s.instalment === next!.seq) : b.shares;
  const whole = byInstalments
    ? b.shares.filter((s) => s.instalment === b.instalments[0]!.seq)
    : b.shares;
  const total = whole.reduce((s, x) => s + x.amountMinor, 0);
  const split = splitView(ctx.hh.id, b.service);
  const how =
    split.mode === 'percent'
      ? tsp('howPercent', {
          parts: split.parts
            .filter((p) => p.setting.kind === 'percent' && p.setting.value > 0)
            .map((p) => (p.setting.kind === 'percent' ? p.setting.value : 0))
            .join(' / '),
        })
      : split.mode === 'fixed'
        ? tsp('howFixed')
        : tsp('howEven');
  const who = (name: string, id: string) => (id === me.id ? t('youCap') : name);
  const whoLow = (name: string, id: string) => (id === me.id ? t('you') : name);
  const dueDate = next?.dueDate ?? b.dueDate;
  const row = (s: BillDetail['shares'][number]): ShareRowModel => {
    const state: ShareRowModel['state'] =
      s.paidMethod === 'payer'
        ? {
            label: t('paysProvider', { provider: b.service.provider }),
            tone: 'neutral',
            icon: 'arrow-right',
          }
        : s.paidAt
          ? { label: t('paidOn', { date: date(s.paidAt, 'short') }), tone: 'ok', icon: 'check' }
          : (s.dueDate ?? dueDate) < today
            ? {
                label: t('overdueOwes', { name: payer ? whoLow(payer.name, payer.id) : '' }),
                tone: 'bad',
                icon: 'alert',
              }
            : {
                label: payer ? t('owes', { name: whoLow(payer.name, payer.id) }) : t('unpaid'),
                tone: 'warn',
                icon: 'clock',
              };
    return {
      member: { name: s.member.name, colour: s.member.colour },
      who: who(s.member.name, s.member.id),
      note:
        s.basisDays !== s.periodDays
          ? t('prorated', { days: s.basisDays, total: s.periodDays })
          : s.paymentReference && !s.paidAt && s.paidMethod !== 'payer'
            ? t('ref', { ref: s.paymentReference })
            : undefined,
      amount: money(s.amountMinor, s.currency),
      state,
    };
  };
  return (
    <Card id="split" className="scroll-mt-24">
      <SectionHead
        title={next ? t('titleInstalment', { n: next.seq }) : t('title')}
        right={<span className="muted">{how}</span>}
      />
      {b.shares.length === 0 ? (
        <p className="muted small">{t('none')}</p>
      ) : (
        <>
          <StackBar
            parts={whole
              .filter((s) => s.amountMinor > 0)
              .map((s) => ({
                value: s.amountMinor,
                colour: s.member.colour,
                label: who(s.member.name, s.member.id),
                text: money(s.amountMinor, s.currency),
                tip: `${who(s.member.name, s.member.id)} · ${money(s.amountMinor, s.currency)} ${t('ofTotal', { total: money(total, b.currency) })}`,
              }))}
          />
          <div className="shares">
            {shown.map((s) => (
              <div key={s.id} className="flex flex-wrap items-center gap-x-3">
                <div className="min-w-0 flex-1">
                  <ShareRow share={row(s)} />
                </div>
                {s.paidMethod !== 'payer' &&
                  (s.memberId === me.id || payer?.id === me.id || !s.paidAt) && (
                    <form action={toggleSharePaidAction}>
                      <input type="hidden" name="shareId" value={s.id} />
                      <input type="hidden" name="billId" value={b.id} />
                      <input type="hidden" name="paid" value={s.paidAt ? 'false' : 'true'} />
                      <Button
                        type="submit"
                        size="sm"
                        variant={
                          s.paidAt ? 'ghost' : s.memberId === me.id ? 'primary' : 'secondary'
                        }
                      >
                        {s.paidAt ? t('markUnpaid') : t('markPaid')}
                      </Button>
                    </form>
                  )}
              </div>
            ))}
          </div>
          {payer && payer.paymentDetails.length > 0 && payer.id !== me.id && (
            <p className="muted small mt-3">
              {t('payTo', { name: payer.name })}:{' '}
              {payer.paymentDetails.map((d) => `${d.label} ${d.value}`).join(' · ')}
            </p>
          )}
        </>
      )}
    </Card>
  );
}
