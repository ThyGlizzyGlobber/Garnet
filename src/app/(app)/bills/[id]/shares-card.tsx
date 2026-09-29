import { getTranslations } from 'next-intl/server';
import { Card } from '@/components/ui';
import { Swatch } from '@/components/ui/colour';
import { InlineAction } from '@/components/ui/form';
import type { BillDetail } from '@/lib/bills';
import type { PageContext } from '@/lib/context';
import { toggleSharePaidAction } from '../actions';

/** Each person's share of the bill (per instalment when paying by instalments), with "paid". */
export async function SharesCard({ bill: b, ctx }: { bill: BillDetail; ctx: PageContext }) {
  const t = await getTranslations('bills');
  const { me, money, date } = ctx;
  const payer = b.shares.find((s) => s.paidMethod === 'payer')?.member;
  // One group per instalment when paying by instalments (one group otherwise).
  const groups = [...new Set(b.shares.map((s) => s.instalment))].map((n) => ({
    n,
    instalment: b.instalments.find((i) => i.seq === n),
    shares: b.shares.filter((s) => s.instalment === n),
  }));
  return (
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
        groups.map((g) => (
          <div key={g.n}>
            {g.instalment && (
              <h3 className="mt-4 text-xs font-semibold tracking-wide text-fg-muted uppercase">
                {t('shares.instalment', { n: g.n, date: date(g.instalment.dueDate, 'short') })}
              </h3>
            )}
            <ul className="mt-3 divide-y divide-border">
              {g.shares.map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-3 py-3">
                  <div className="flex items-center gap-3">
                    <Swatch colour={s.member.colour} dot />
                    <div>
                      <p className="font-medium">
                        {s.member.name}{' '}
                        {s.memberId === me.id && (
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
                        {s.basisDays !== s.periodDays &&
                          ` · ${t('shares.prorated', { days: s.basisDays, total: s.periodDays })}`}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-semibold tabular-nums">
                      {money(s.amountMinor, s.currency)}
                    </span>
                    {s.paidMethod !== 'payer' && (
                      <InlineAction
                        action={toggleSharePaidAction}
                        hidden={{ shareId: s.id, billId: b.id, paid: s.paidAt ? 'false' : 'true' }}
                        label={s.paidAt ? t('shares.markUnpaid') : t('shares.markPaid')}
                        variant={s.paidAt ? 'ghost' : 'primary'}
                      />
                    )}
                  </div>
                </li>
              ))}
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
  );
}
