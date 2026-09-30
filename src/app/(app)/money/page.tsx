import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { Badge, DownloadButton, Figure, PageHeader, Tile, TileHeader } from '@/components/ui';
import { Avatar, Swatch } from '@/components/ui/colour';
import { InlineAction } from '@/components/ui/form';
import { Ring } from '@/components/ui/ring';
import { pageContext } from '@/lib/context';
import { listMembers } from '@/lib/members';
import { groupByMonth } from '@/lib/bill-month';
import { memberLedger } from '@/lib/stats';
import { toggleSharePaidAction } from '../bills/actions';
import { isAdmin } from '@/lib/roles';

export default async function LedgerPage({
  searchParams,
}: {
  searchParams: Promise<{ member?: string }>;
}) {
  const { hh, me, money, date, month, today } = await pageContext();
  if (hh.splitMode !== 'shared') redirect('/');
  const t = await getTranslations('ledger');
  const { member: requested } = await searchParams;
  const viewingId = isAdmin(me) && requested ? requested : me.id;
  const ledger = memberLedger(hh.id, viewingId, today, hh.fiscalYearStartMonth);
  if (!ledger) redirect('/money');
  const isMe = ledger.member.id === me.id;
  const members = isAdmin(me) ? listMembers(hh.id) : [];
  const paidPct = ledger.paidPct;
  const groups = groupByMonth(ledger.recent, (s) => s.bill.periodStart);

  return (
    <>
      <PageHeader
        title={isMe ? t('titleMe') : t('titleOther', { name: ledger.member.name })}
        subtitle={t('subtitle', { label: hh.name })}
        action={
          <DownloadButton
            href={`/api/export?kind=member&member=${ledger.member.id}`}
            label={t('download')}
          />
        }
      />
      {members.length > 1 && (
        <div className="mb-5 flex flex-wrap gap-2">
          {members.map((m) => (
            <Link
              key={m.id}
              href={m.id === me.id ? '/money' : `/money?member=${m.id}`}
              className={`flex items-center gap-2 rounded-full py-1.5 pr-4 pl-1.5 text-sm font-semibold transition ${m.id === ledger.member.id ? 'bg-accent text-accent-fg' : 'bg-surface-2 text-fg-muted hover:text-fg'}`}
            >
              <Avatar name={m.name} colour={m.colour} className="size-7 text-[11px]" />
              {m.name}
            </Link>
          ))}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[1.3fr_1fr_1fr]">
        <Tile
          className={`flex flex-wrap items-center gap-6 ${ledger.owed > 0 ? 'bg-warning-soft' : 'bg-success-soft'}`}
        >
          <Ring
            id="ledger-paid"
            pct={paidPct}
            size={124}
            stroke={12}
            from="var(--color-success)"
            to="var(--color-accent-2)"
          >
            <span className="flex flex-col items-center leading-none">
              <span className="font-display text-[24px] font-semibold tabular-nums">
                {paidPct}%
              </span>
              <span className="mt-1 text-[11px] font-semibold tracking-wide text-fg-muted uppercase">
                {t('tiles.paidRing')}
              </span>
            </span>
          </Ring>
          <div className="min-w-44 flex-1">
            <p className="text-sm font-semibold">{t('tiles.owed')}</p>
            <Figure tone={ledger.owed > 0 ? 'warning' : 'success'}>{money(ledger.owed)}</Figure>
            <p className="mt-2 text-xs text-fg-muted">
              {t('unpaid.count', { count: ledger.unpaid.length })} ·{' '}
              {t('tiles.ofTotal', { total: money(ledger.totalThisFy) })}
            </p>
          </div>
        </Tile>
        <Tile className="flex flex-col gap-3">
          <p className="text-sm font-semibold">{t('tiles.owedToYou')}</p>
          <Figure size="md">{money(ledger.owedToMe)}</Figure>
          {ledger.owedToMeBy.length ? (
            <ul className="flex flex-col gap-2">
              {ledger.owedToMeBy.map((x) => (
                <li key={x.member.id} className="flex items-center gap-2 text-sm">
                  <Avatar
                    name={x.member.name}
                    colour={x.member.colour}
                    className="size-7 text-[11px]"
                  />
                  <span className="flex-1">{x.member.name}</span>
                  <span className="font-semibold tabular-nums text-warning">{money(x.minor)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-fg-muted">{t('tiles.nobody')}</p>
          )}
        </Tile>
        <Tile className="flex flex-col gap-2">
          <p className="text-sm font-semibold">{t('tiles.paidFy')}</p>
          <Figure size="md">{money(ledger.paidThisFy)}</Figure>
          <div className="mt-1 h-2 rounded-full bg-surface-2">
            <div
              className="h-2 rounded-full bg-accent"
              style={{ width: `${Math.max(paidPct, 2)}%` }}
            />
          </div>
          <p className="text-xs text-fg-muted">
            {t('tiles.ofTotal', { total: money(ledger.totalThisFy) })}
          </p>
        </Tile>
      </div>

      <Tile className="mt-4 flex flex-col gap-2">
        <TileHeader title={t('unpaid.title')} />
        {ledger.unpaid.length === 0 ? (
          <p className="text-sm text-success">{t('unpaid.empty')}</p>
        ) : (
          <ul className="divide-y divide-border">
            {ledger.unpaid.map((s) => {
              const due = s.dueDate ?? s.bill.dueDate;
              const overdue = due < today;
              return (
                <li key={s.id} className="flex flex-wrap items-center gap-3 py-3 sm:flex-nowrap">
                  {s.payer ? (
                    <Avatar name={s.payer.name} colour={s.payer.colour} />
                  ) : (
                    <span className="size-10 shrink-0 rounded-full bg-surface-2" />
                  )}
                  <div className="min-w-0 flex-1">
                    <Link href={`/bills/${s.billId}`} className="block truncate font-semibold">
                      {s.service.name}{' '}
                      <span className="font-normal text-fg-muted">
                        ·{' '}
                        {s.instalment
                          ? t('unpaid.instalment', { n: s.instalment, date: date(due, 'short') })
                          : `${date(s.bill.periodStart, 'short')} – ${date(s.bill.periodEnd, 'short')}`}
                      </span>
                    </Link>
                    <p className="flex flex-wrap items-center gap-x-2 text-xs text-fg-muted">
                      {s.payer ? t('unpaid.payTo', { name: s.payer.name }) : t('unpaid.noPayer')}
                      {s.paymentReference && (
                        <span className="font-mono">{s.paymentReference}</span>
                      )}
                      {overdue && <Badge tone="danger">{t('unpaid.overdue')}</Badge>}
                    </p>
                    {s.payer && s.payer.paymentDetails.length > 0 && (
                      <p className="mt-0.5 text-xs text-fg-muted">
                        {s.payer.paymentDetails.map((d) => `${d.label} ${d.value}`).join(' · ')}
                      </p>
                    )}
                  </div>
                  <span className="font-display text-xl font-semibold tabular-nums">
                    {money(s.amountMinor, s.currency)}
                  </span>
                  <InlineAction
                    action={toggleSharePaidAction}
                    hidden={{ shareId: s.id, billId: s.billId, paid: 'true' }}
                    label={t('unpaid.markPaid')}
                  />
                </li>
              );
            })}
          </ul>
        )}
      </Tile>

      <Tile className="mt-4">
        <TileHeader title={t('history.title')} />
        {groups.map(([m, items]) => (
          <div key={m} className="mt-4">
            <p className="mb-1 text-[11px] font-semibold tracking-wide text-fg-muted uppercase">
              {month(m, 'long-year')}
            </p>
            <ul className="divide-y divide-border text-sm">
              {items.map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-3 py-2.5">
                  <Link href={`/bills/${s.billId}`} className="flex min-w-0 items-center gap-3">
                    <Swatch colour={s.service.colour} dot />
                    <span className="min-w-0">
                      <span className="block truncate">{s.service.name}</span>
                      <span className="text-xs text-fg-muted">
                        {s.paidAt
                          ? s.paidMethod === 'payer'
                            ? t('history.paidProvider')
                            : t('history.paidOn', { date: date(s.paidAt, 'short') })
                          : t('history.unpaid')}
                      </span>
                    </span>
                  </Link>
                  <span className={`font-semibold tabular-nums ${s.paidAt ? '' : 'text-warning'}`}>
                    {money(s.amountMinor, s.currency)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </Tile>
    </>
  );
}
