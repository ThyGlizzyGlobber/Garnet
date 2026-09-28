import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { Badge, PageHeader } from '@/components/ui';
import { InlineAction } from '@/components/ui/form';
import { Ring } from '@/components/ui/ring';
import { pageContext } from '@/lib/context';
import { listMembers } from '@/lib/members';
import { darkVariant } from '@/lib/palette';
import { memberLedger, type LedgerShare } from '@/lib/stats';
import { toggleSharePaidAction } from '../bills/actions';

const tile = 'glass lift rounded-card p-5 sm:p-6';
const avatar = (colour: string) => ({
  background: `linear-gradient(135deg, light-dark(${colour}, ${darkVariant(colour)}), var(--color-accent))`,
});

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
  const ledger = memberLedger(hh.id, viewingId, today, hh.fiscalYearStartMonth);
  if (!ledger) redirect('/ledger');
  const isMe = ledger.member.id === me.id;
  const members = me.role === 'owner' ? listMembers(hh.id) : [];
  const paidPct =
    ledger.totalThisFy > 0 ? Math.round((ledger.paidThisFy / ledger.totalThisFy) * 100) : 0;
  const monthLabel = (iso: string) =>
    new Intl.DateTimeFormat(hh.locale, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
      new Date(`${iso.slice(0, 7)}-01T00:00:00Z`),
    );
  const groups = new Map<string, LedgerShare[]>();
  for (const s of ledger.recent)
    groups.set(s.bill.periodStart.slice(0, 7), [
      ...(groups.get(s.bill.periodStart.slice(0, 7)) ?? []),
      s,
    ]);

  return (
    <>
      <PageHeader
        title={isMe ? t('titleMe') : t('titleOther', { name: ledger.member.name })}
        subtitle={t('subtitle', { label: hh.name })}
        action={
          <a
            href={`/api/export?kind=member&member=${ledger.member.id}`}
            className="glass inline-flex items-center rounded-full px-4 py-2 text-sm font-semibold text-fg hover:bg-surface-2"
          >
            {t('download')}
          </a>
        }
      />
      {members.length > 1 && (
        <div className="mb-5 flex flex-wrap gap-2">
          {members.map((m) => (
            <Link
              key={m.id}
              href={m.id === me.id ? '/ledger' : `/ledger?member=${m.id}`}
              className={`flex items-center gap-2 rounded-full py-1.5 pr-4 pl-1.5 text-sm font-semibold transition ${m.id === ledger.member.id ? 'bg-accent text-accent-fg' : 'bg-surface-2 text-fg-muted hover:text-fg'}`}
            >
              <span
                className="grid size-7 place-items-center rounded-full text-[11px] font-bold text-white"
                style={avatar(m.colour)}
              >
                {m.name.slice(0, 1).toUpperCase()}
              </span>
              {m.name}
            </Link>
          ))}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[1.3fr_1fr_1fr]">
        <section
          className={`${tile} flex items-center gap-6 ${ledger.owed > 0 ? 'bg-warning-soft' : 'bg-success-soft'}`}
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
              <span className="mt-1 text-[10px] font-semibold tracking-wide text-fg-muted uppercase">
                {t('tiles.paidRing')}
              </span>
            </span>
          </Ring>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">{t('tiles.owed')}</p>
            <p
              className={`font-display text-[40px] leading-none font-semibold tracking-tight tabular-nums ${ledger.owed > 0 ? 'text-warning' : 'text-success'}`}
            >
              {money(ledger.owed)}
            </p>
            <p className="mt-2 text-xs text-fg-muted">
              {t('unpaid.count', { count: ledger.unpaid.length })} ·{' '}
              {t('tiles.ofTotal', { total: money(ledger.totalThisFy) })}
            </p>
          </div>
        </section>
        <section className={`${tile} flex flex-col gap-3`}>
          <p className="text-sm font-semibold">{t('tiles.owedToYou')}</p>
          <p className="font-display text-[36px] leading-none font-semibold tracking-tight tabular-nums">
            {money(ledger.owedToMe)}
          </p>
          {ledger.owedToMeBy.length ? (
            <ul className="flex flex-col gap-2">
              {ledger.owedToMeBy.map((x) => (
                <li key={x.member.id} className="flex items-center gap-2 text-sm">
                  <span
                    className="grid size-7 place-items-center rounded-full text-[11px] font-bold text-white"
                    style={avatar(x.member.colour)}
                  >
                    {x.member.name.slice(0, 1).toUpperCase()}
                  </span>
                  <span className="flex-1">{x.member.name}</span>
                  <span className="font-semibold tabular-nums text-warning">{money(x.minor)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-fg-muted">{t('tiles.nobody')}</p>
          )}
        </section>
        <section className={`${tile} flex flex-col gap-2`}>
          <p className="text-sm font-semibold">{t('tiles.paidFy')}</p>
          <p className="font-display text-[36px] leading-none font-semibold tracking-tight tabular-nums">
            {money(ledger.paidThisFy)}
          </p>
          <div className="mt-1 h-2 rounded-full bg-surface-2">
            <div
              className="h-2 rounded-full bg-accent"
              style={{ width: `${Math.max(paidPct, 2)}%` }}
            />
          </div>
          <p className="text-xs text-fg-muted">
            {t('tiles.ofTotal', { total: money(ledger.totalThisFy) })}
          </p>
        </section>
      </div>

      <section className={`${tile} mt-4 flex flex-col gap-2`}>
        <h2 className="font-display text-lg font-semibold">{t('unpaid.title')}</h2>
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
                    <span
                      className="grid size-10 shrink-0 place-items-center rounded-full text-sm font-bold text-white"
                      style={avatar(s.payer.colour)}
                    >
                      {s.payer.name.slice(0, 1).toUpperCase()}
                    </span>
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
      </section>

      <section className={`${tile} mt-4`}>
        <h2 className="font-display text-lg font-semibold">{t('history.title')}</h2>
        {[...groups.entries()].map(([m, items]) => (
          <div key={m} className="mt-4">
            <p className="mb-1 text-[11px] font-semibold tracking-wide text-fg-muted uppercase">
              {monthLabel(`${m}-01`)}
            </p>
            <ul className="divide-y divide-border text-sm">
              {items.map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-3 py-2.5">
                  <Link href={`/bills/${s.billId}`} className="flex min-w-0 items-center gap-3">
                    <span
                      className="size-2.5 shrink-0 rounded-full"
                      style={{
                        background: `light-dark(${s.service.colour}, ${darkVariant(s.service.colour)})`,
                      }}
                    />
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
      </section>
    </>
  );
}
