import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { Badge, Card, Figure, LinkButton } from '@/components/ui';
import { IconDisc } from '@/components/ui/colour';
import { InlineAction } from '@/components/ui/form';
import { billFiles, personNotes } from '@/lib/bill-files';
import { getBill, housematesPaid } from '@/lib/bills';
import { pageContext } from '@/lib/context';
import { canChoosePlan, dueNow, paysByInstalments } from '@/lib/instalments';
import { hasHousemates } from '@/lib/members';
import { asksMember, mayChangeOwner } from '@/lib/ownership';
import { visibleTo } from '@/lib/scope';
import { unitLabel } from '@/lib/units';
import {
  answerOwnershipAction,
  clearBillAlertAction,
  deleteBillAction,
  setWhoseAction,
  toggleBillPaidAction,
} from '../actions';
import { BillFilesCard } from './bill-files';
import { FiguresCard } from './figures-card';
import { PaymentPlan } from './payment-plan';
import { SharesCard } from './shares-card';

/**
 * One page per bill: its cost and status, its details and whose it is, the
 * files that came with it, how it's paid (in full or by instalments), each
 * person's share, and every figure read off it.
 */
export default async function BillPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await pageContext();
  const { hh, me, money, date, today } = ctx;
  const t = await getTranslations('bills');
  const b = getBill(hh.id, id);
  // Another member's personal bill doesn't exist, as far as anyone else can tell.
  if (!b || !visibleTo(b.ownerMemberId, me.id)) notFound();
  const personal = !!b.ownerMemberId;
  const overdue = !b.paidToProviderAt && b.dueDate < today;
  const byInstalments = paysByInstalments(b);
  const dueNext = byInstalments ? dueNow(b) : null;
  const files = billFiles(hh.id, b.id);
  const notes = personNotes(b.notes, files.find((f) => f.kind === 'bill')?.doc ?? null);
  // Whose it is matters once anyone else lives there, split or not.
  const housemates = hasHousemates(hh.id);
  // A household that doesn't split bills: nothing is "split", only seen or not.
  const split = hh.splitMode === 'shared' ? 'yes' : 'no';

  return (
    <div className="mx-auto max-w-4xl">
      <header className="mb-5 flex flex-wrap items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-4">
          <IconDisc icon={b.service.type.icon} colour={b.service.colour} variant="glow" size={56} />
          <div className="min-w-0">
            <h1 className="truncate font-display text-[26px] leading-tight font-semibold tracking-tight sm:text-[32px]">
              {b.service.name}
            </h1>
            <p className="truncate text-sm text-fg-muted">
              {b.service.provider} · {date(b.periodStart)} – {date(b.periodEnd)}
            </p>
          </div>
        </div>
        <LinkButton href={`/bills/${b.id}/edit`} variant="secondary">
          {t('edit')}
        </LinkButton>
      </header>

      {housemates && asksMember(b.service, me) && (
        <Card className="mb-4 flex flex-col gap-3 border-accent/40 bg-accent-soft" id="whose">
          <div>
            <p className="font-display text-lg font-semibold">{t('whose.title')}</p>
            <p className="text-sm text-fg-muted">
              {t(personal ? 'whose.bodyMine' : 'whose.bodyHousehold', {
                service: b.service.name,
                split,
              })}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <InlineAction
              action={answerOwnershipAction}
              hidden={{ billId: b.id, answer: 'mine' }}
              label={t('whose.mine')}
              variant={personal ? 'primary' : 'secondary'}
            />
            <InlineAction
              action={answerOwnershipAction}
              hidden={{ billId: b.id, answer: 'household' }}
              label={t('whose.household')}
              variant={personal ? 'secondary' : 'primary'}
            />
          </div>
        </Card>
      )}

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
              <a href="#files" className="text-sm font-semibold text-accent">
                {t('alert.viewEmail')} <span aria-hidden="true">↓</span>
              </a>
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

      {/* The cost, and where it stands. */}
      <section
        className={`glass rounded-card p-5 sm:p-6 ${overdue ? 'bg-danger-soft' : 'bg-accent-soft'}`}
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-fg-muted">{t('detail.amount')}</p>
            <Figure size="hero">{money(b.amountMinor, b.currency)}</Figure>
            {b.taxMinor !== null && (
              <p className="mt-1 text-xs text-fg-muted">
                {t('detail.includesTax', {
                  amount: money(b.taxMinor, b.currency),
                  label: b.taxLabel ?? t('detail.tax'),
                })}
              </p>
            )}
            <p className={`mt-3 text-sm font-semibold ${overdue ? 'text-danger' : ''}`}>
              {b.paidToProviderAt
                ? t('detail.paidOn', { date: date(b.paidToProviderAt) })
                : dueNext
                  ? t('detail.instalmentDue', {
                      amount: money(dueNext.amountMinor, b.currency),
                      n: dueNext.seq ?? 1,
                      of: dueNext.of,
                      date: date(dueNext.dueDate),
                    })
                  : overdue
                    ? t('detail.wasDue', { date: date(b.dueDate) })
                    : t('detail.dueOn', { date: date(b.dueDate) })}
            </p>
          </div>
          <div className="flex flex-col items-end gap-2">
            {b.paidToProviderAt ? (
              <Badge tone="success">{t('detail.paidToProvider')}</Badge>
            ) : overdue ? (
              <Badge tone="danger">{t('overdue')}</Badge>
            ) : (
              <Badge tone="warning">{t('detail.unpaid')}</Badge>
            )}
            {personal && <Badge>{t('tile.onlyYou')}</Badge>}
            {b.isAnomaly && <Badge tone="warning">{t('anomaly')}</Badge>}
          </div>
        </div>
        {b.isAnomaly && b.anomalyNote && (
          <p className="mt-4 rounded-xl bg-warning-soft px-4 py-3 text-sm text-warning">
            {b.anomalyNote}
          </p>
        )}
        {!byInstalments && (
          <div className="mt-4">
            <InlineAction
              action={toggleBillPaidAction}
              hidden={{ id: b.id, paid: b.paidToProviderAt ? 'false' : 'true' }}
              label={
                b.paidToProviderAt ? t('detail.markUnpaidProvider') : t('detail.markPaidProvider')
              }
              variant={b.paidToProviderAt ? 'ghost' : 'primary'}
            />
          </div>
        )}
      </section>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        {/* The details. */}
        <Card>
          <h2 className="font-display text-lg font-semibold">{t('detail.detailsTitle')}</h2>
          <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
            <Row
              label={byInstalments ? t('plan.nextDue') : t('detail.dueDate')}
              value={date(b.dueDate)}
            />
            <Row label={t('detail.issueDate')} value={date(b.issueDate) || '—'} />
            <Row
              label={t('detail.period')}
              value={`${date(b.periodStart, 'short')} – ${date(b.periodEnd, 'short')}`}
            />
            <Row label={t('detail.externalRef')} value={b.externalRef ?? '—'} />
            <Row label={t('detail.account')} value={b.service.accountRef ?? '—'} />
            <Row
              label={t('detail.usage')}
              value={
                b.usageQuantity !== null
                  ? `${ctx.qty(b.usageQuantity)} ${unitLabel(b.usageUnit)}`
                  : '—'
              }
            />
            <Row label={t('detail.paidToProviderAt')} value={date(b.paidToProviderAt) || '—'} />
            <Row label={t('detail.type')} value={b.service.type.label} />
          </dl>
          {notes && <p className="mt-4 text-sm whitespace-pre-wrap text-fg-muted">{notes}</p>}
          {housemates && (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-surface-2 px-4 py-3">
              <div className="min-w-0">
                <p className="text-xs text-fg-muted">{t('whose.label')}</p>
                <p className="text-sm font-medium">
                  {t(personal ? 'whose.isMine' : 'whose.isHousehold', { split })}
                </p>
              </div>
              {!personal && housematesPaid(hh.id, b.serviceId) ? (
                <p className="text-xs text-fg-muted">{t('whose.lockedShares')}</p>
              ) : (
                mayChangeOwner(hh.id, me, b.service) && (
                  <InlineAction
                    action={setWhoseAction}
                    hidden={{ billId: b.id, whose: personal ? 'household' : 'mine' }}
                    label={personal ? t('whose.makeHousehold') : t('whose.makeMine')}
                    variant="secondary"
                    confirm={t(personal ? 'whose.confirmHousehold' : 'whose.confirmMine', {
                      service: b.service.name,
                      split,
                    })}
                  />
                )
              )}
            </div>
          )}
        </Card>

        {/* The email and file it came from, and anything since. */}
        <BillFilesCard
          billId={b.id}
          files={files}
          enteredByHand={b.source === 'manual' && !b.sourceDocumentId}
          ctx={ctx}
        />
      </div>

      {b.instalments.length > 0 && (
        <PaymentPlan bill={b} canChoose={canChoosePlan(me, b)} ctx={ctx} />
      )}

      {personal && (
        <p className="mt-4 rounded-card bg-surface-2 px-5 py-3 text-sm text-fg-muted">
          {t('detail.personalNote')}
        </p>
      )}

      {hh.splitMode === 'shared' && !personal && <SharesCard bill={b} ctx={ctx} />}

      <FiguresCard bill={b} ctx={ctx} />

      <div className="mt-8 flex justify-end">
        <InlineAction
          action={deleteBillAction}
          hidden={{ id: b.id }}
          label={t('delete')}
          variant="danger"
          confirm={t('deleteConfirm')}
        />
      </div>
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
