import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { Badge, Card, PageHeader } from '@/components/ui';
import { InlineAction } from '@/components/ui/form';
import { pageContext } from '@/lib/context';
import { listMembers } from '@/lib/members';
import { memberLedger } from '@/lib/stats';
import { toggleSharePaidAction } from '../bills/actions';

export default async function LedgerPage({
  searchParams,
}: {
  searchParams: Promise<{ member?: string }>;
}) {
  const { hh, me, money, date, today } = await pageContext();
  if (hh.splitMode !== 'shared') redirect('/');
  const t = await getTranslations('ledger');
  const { member: requested } = await searchParams;
  const viewingId = me.role === 'owner' && requested ? requested : me.id;
  const ledger = memberLedger(viewingId, today, hh.fiscalYearStartMonth);
  if (!ledger) redirect('/ledger');
  const isMe = ledger.member.id === me.id;
  const members = me.role === 'owner' ? listMembers() : [];

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title={isMe ? t('titleMe') : t('titleOther', { name: ledger.member.name })}
        subtitle={t('subtitle', { label: hh.name })}
      />

      {members.length > 1 && (
        <div className="mb-4 flex flex-wrap gap-2">
          {members.map((m) => (
            <Link
              key={m.id}
              href={m.id === me.id ? '/ledger' : `/ledger?member=${m.id}`}
              className={`rounded-full px-3.5 py-1.5 text-sm font-medium ${m.id === ledger.member.id ? 'bg-accent text-accent-fg' : 'bg-surface-2 text-fg-muted'}`}
            >
              {m.name}
            </Link>
          ))}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <p className="text-sm text-fg-muted">{t('tiles.owed')}</p>
          <p
            className={`mt-1 text-3xl font-semibold tabular-nums ${ledger.owed > 0 ? 'text-warning' : 'text-success'}`}
          >
            {money(ledger.owed)}
          </p>
        </Card>
        <Card>
          <p className="text-sm text-fg-muted">{t('tiles.owedToYou')}</p>
          <p className="mt-1 text-3xl font-semibold tabular-nums">{money(ledger.owedToMe)}</p>
          {ledger.owedToMeBy.length > 0 && (
            <p className="mt-1 text-xs text-fg-muted">
              {ledger.owedToMeBy.map((x) => `${x.member.name} ${money(x.minor)}`).join(' · ')}
            </p>
          )}
        </Card>
        <Card>
          <p className="text-sm text-fg-muted">{t('tiles.paidFy')}</p>
          <p className="mt-1 text-3xl font-semibold tabular-nums">{money(ledger.paidThisFy)}</p>
          <p className="mt-1 text-xs text-fg-muted">
            {t('tiles.ofTotal', { total: money(ledger.totalThisFy) })}
          </p>
        </Card>
      </div>

      <Card className="mt-4">
        <h2 className="font-semibold">{t('unpaid.title')}</h2>
        {ledger.unpaid.length === 0 ? (
          <p className="mt-3 text-sm text-success">{t('unpaid.empty')}</p>
        ) : (
          <ul className="mt-2 divide-y divide-border">
            {ledger.unpaid.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <Link href={`/bills/${s.billId}`} className="block truncate font-medium">
                    {s.service.name}{' '}
                    <span className="font-normal text-fg-muted">
                      · {date(s.bill.periodStart, 'short')} – {date(s.bill.periodEnd, 'short')}
                    </span>
                  </Link>
                  <p className="text-xs text-fg-muted">
                    {s.payer ? t('unpaid.payTo', { name: s.payer.name }) : t('unpaid.noPayer')}
                    {s.paymentReference && ` · ${t('unpaid.ref', { ref: s.paymentReference })}`}
                    {s.bill.dueDate < today && (
                      <>
                        {' '}
                        <Badge tone="danger">{t('unpaid.overdue')}</Badge>
                      </>
                    )}
                  </p>
                  {s.payer && s.payer.paymentDetails.length > 0 && (
                    <p className="mt-0.5 text-xs text-fg-muted">
                      {s.payer.paymentDetails.map((d) => `${d.label} ${d.value}`).join(' · ')}
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <span className="font-semibold tabular-nums">
                    {money(s.amountMinor, s.currency)}
                  </span>
                  <InlineAction
                    action={toggleSharePaidAction}
                    hidden={{ shareId: s.id, billId: s.billId, paid: 'true' }}
                    label={t('unpaid.markPaid')}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="mt-4">
        <h2 className="font-semibold">{t('history.title')}</h2>
        <ul className="mt-2 divide-y divide-border text-sm">
          {ledger.recent.map((s) => (
            <li key={s.id} className="flex items-center justify-between gap-3 py-2.5">
              <Link href={`/bills/${s.billId}`} className="min-w-0">
                <span className="block truncate">
                  {s.service.name}{' '}
                  <span className="text-fg-muted">· {date(s.bill.periodStart, 'short')}</span>
                </span>
                <span className="text-xs text-fg-muted">
                  {s.paidAt
                    ? s.paidMethod === 'payer'
                      ? t('history.paidProvider')
                      : t('history.paidOn', { date: date(s.paidAt, 'short') })
                    : t('history.unpaid')}
                </span>
              </Link>
              <span className={`font-semibold tabular-nums ${s.paidAt ? '' : 'text-warning'}`}>
                {money(s.amountMinor, s.currency)}
              </span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
