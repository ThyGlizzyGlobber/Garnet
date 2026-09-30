import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { rowCtx, statusLabel } from '@/components/app/bill-rows';
import { Button, Card, LinkButton } from '@/components/ui';
import { Eyebrow, Kv, Money, Notice, SectionHead } from '@/components/ui/blocks';
import { Chip, StatusChip } from '@/components/ui/chip';
import { Disc } from '@/components/ui/colour';
import { BackLink } from '@/components/ui/controls';
import { InlineAction } from '@/components/ui/form';
import { billFiles, personNotes } from '@/lib/bill-files';
import { billDue } from '@/lib/bill-status';
import { getBill, housematesPaid } from '@/lib/bills';
import { pageContext } from '@/lib/context';
import { daysInclusive } from '@/lib/dates';
import { formatMonthRange, formatPeriod } from '@/lib/format';
import { canChoosePlan, paysByInstalments } from '@/lib/instalments';
import { getMember, hasHousemates } from '@/lib/members';
import { asksMember, mayChangeOwner, mayMoveBill } from '@/lib/ownership';
import { chargedAfterCancel, groupServices, listServices } from '@/lib/services';
import { visibleTo } from '@/lib/scope';
import { unusualOf } from '@/lib/service-overview';
import { unitLabel } from '@/lib/units';
import {
  answerOwnershipAction,
  clearBillAlertAction,
  deleteBillAction,
  moveBillAction,
  setWhoseAction,
  toggleBillPaidAction,
  toggleSharePaidAction,
} from '../actions';
import { BillFilesCard } from './bill-files';
import { FiguresCard } from './figures-card';
import { MoveBill, type MoveTarget } from './move-bill';
import { Paper } from './paper';
import { PaymentPlan } from './payment-plan';
import { SharesCard } from './shares-card';

/**
 * One page per bill, laid out like the document itself: the bill's first
 * page and its files on the left; on the right its cost and status, the
 * details, how it's split, how it's paid, and every figure read off it.
 */
export default async function BillPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await pageContext();
  const { hh, me, money, date, today } = ctx;
  const t = await getTranslations('bills');
  const tu = await getTranslations('ui');
  const rc = rowCtx(ctx, tu);
  const b = getBill(hh.id, id);
  // Another member's personal bill doesn't exist, as far as anyone else can tell.
  if (!b || !visibleTo(b.ownerMemberId, me.id)) notFound();
  const personal = !!b.ownerMemberId;
  const split = hh.splitMode === 'shared' && !personal;
  const byInstalments = paysByInstalments(b);
  const due = billDue(b, today);
  const files = billFiles(hh.id, b.id);
  const billFile = files.find((f) => f.kind === 'bill');
  const notes = personNotes(b.notes, billFile?.doc ?? null);
  // Whose it is matters once anyone else lives there, split or not.
  const housemates = hasHousemates(hh.id);
  const splitWord = hh.splitMode === 'shared' ? 'yes' : 'no';
  const payer = b.service.payerMemberId ? getMember(hh.id, b.service.payerMemberId) : null;
  const payerName = payer ? (payer.id === me.id ? t('page.you') : payer.name) : null;
  const days = daysInclusive(b.periodStart, b.periodEnd);
  const range = formatMonthRange(b.periodStart, b.periodEnd, hh.locale);
  const enteredBy = b.createdByMemberId
    ? (getMember(hh.id, b.createdByMemberId)?.name ?? null)
    : null;
  const unusual = b.isAnomaly ? unusualOf(b) : null;
  const paidAt =
    due.status.key === 'paid'
      ? byInstalments
        ? b.instalments.at(-1)?.paidToProviderAt
        : b.paidToProviderAt
      : null;

  // The line under the amount: what it covers and who pays whom.
  const line =
    due.instalment && due.status.key !== 'paid'
      ? t('page.lineInstalment', {
          n: due.instalment.n,
          of: due.instalment.of,
          date: date(due.status.dueDate),
          amount: money(b.amountMinor, b.currency),
          range,
        })
      : paidAt
        ? t('page.linePaid', {
            range,
            days,
            who: personal ? t('page.you') : (payerName ?? t('page.someone')),
            provider: b.service.provider,
            date: date(paidAt),
          })
        : t('page.lineDue', {
            range,
            days,
            who: personal ? t('page.you') : (payerName ?? t('page.nobody')),
            provider: b.service.provider,
          });

  // The one thing to do: my share to pay back, or the bill to pay the provider.
  const mine = split
    ? b.shares.find((s) => s.memberId === me.id && s.instalment === (due.instalment?.n ?? 0))
    : null;
  const canPayShare = !!mine && mine.paidMethod !== 'payer' && !mine.paidAt;

  // "Move to": every service it may go to, a main service's sub-services
  // together, then the viewer's own.
  const movable = listServices(hh.id, { includeInactive: true, viewer: me.id }).filter(
    (s) => s.id === b.serviceId || mayMoveBill(hh.id, me, b, s),
  );
  const optionName = (s: (typeof movable)[number]) =>
    `${s.name}${!s.type.hasSubServices && s.provider && s.provider !== s.name ? ` · ${s.provider}` : ''}${s.cancelledAt ? ` (${t('move.cancelled')})` : ''}`;
  const moveTargets: MoveTarget[] = [
    { owner: false, label: '' },
    { owner: true, label: t('move.yours') },
  ]
    .flatMap(({ owner, label }) =>
      groupServices(movable.filter((s) => !!s.ownerMemberId === owner)).map((g) => ({
        label: g.typeSlug ? (owner ? `${g.label} · ${label}` : g.label) : label,
        options: g.services.map((s) => ({ id: s.id, name: optionName(s) })),
      })),
    )
    // Services on their own next to each other share one list.
    .reduce<MoveTarget[]>((out, g) => {
      const last = out.at(-1);
      if (last && last.label === g.label) last.options.push(...g.options);
      else out.push(g);
      return out;
    }, []);
  const afterCancel = chargedAfterCancel(b.service, b);
  const iPayProvider = personal || !split || payer?.id === me.id || !payer;

  return (
    <div className="scr d3-bill">
      <BackLink href={`/services/${b.service.id}`}>{b.service.name}</BackLink>
      <div className="d3-bill-grid">
        <div className="d3-doc">
          <Paper bill={b} file={billFile} ctx={ctx} />
          <BillFilesCard bill={b} files={files} enteredBy={enteredBy} rc={rc} />
        </div>

        <div className="d3-bill-body">
          <Card className="d3-bill-hero">
            <div className="bp-hero">
              <div className="bp-id">
                <Disc icon={b.service.type.icon} colour={b.service.colour} size="lg" />
                <div>
                  <Eyebrow>
                    {/* A sub-service reads "Subscriptions", its provider under it. */}
                    {b.service.type.hasSubServices ? b.service.type.label : b.service.name}
                    {personal ? ` · ${t('page.yours')}` : ''}
                  </Eyebrow>
                  <div className="bp-prov">{b.service.provider}</div>
                </div>
              </div>
              <Money
                minor={due.amountMinor}
                currency={b.currency}
                locale={hh.locale}
                className="bp-amt"
              />
              <div className="bp-status">
                <StatusChip
                  status={{ label: statusLabel(rc, due.status), tone: due.status.tone }}
                />
                {unusual && (
                  <Chip tone="warn" icon="trend-up">
                    {unusual.pct !== null
                      ? t(unusual.pct >= 0 ? 'page.unusualHigher' : 'page.unusualLower', {
                          pct: Math.round(Math.abs(unusual.pct) * 100),
                        })
                      : t('anomaly')}
                  </Chip>
                )}
                {b.alertKind && (
                  <Chip tone="bad" icon="alert">
                    {t(`alert.${b.alertKind}`)}
                  </Chip>
                )}
                {byInstalments && (
                  <Chip tone="info" icon="repeat">
                    {t('plan.byInstalments')}
                  </Chip>
                )}
              </div>
              <p className="bp-line">{line}</p>
            </div>
            <div className="bp-actions">
              {canPayShare && mine && (
                <form action={toggleSharePaidAction}>
                  <input type="hidden" name="shareId" value={mine.id} />
                  <input type="hidden" name="billId" value={b.id} />
                  <input type="hidden" name="paid" value="true" />
                  <Button type="submit" icon="check">
                    {t('page.markMyShare', { amount: money(mine.amountMinor, b.currency) })}
                  </Button>
                </form>
              )}
              {!canPayShare && iPayProvider && !byInstalments && (
                <form action={toggleBillPaidAction}>
                  <input type="hidden" name="id" value={b.id} />
                  <input type="hidden" name="paid" value={b.paidToProviderAt ? 'false' : 'true'} />
                  <Button
                    type="submit"
                    variant={b.paidToProviderAt ? 'ghost' : 'primary'}
                    icon={b.paidToProviderAt ? undefined : 'check'}
                  >
                    {b.paidToProviderAt
                      ? t('detail.markUnpaidProvider')
                      : t('page.markPaidProvider', { provider: b.service.provider })}
                  </Button>
                </form>
              )}
              <LinkButton href={`/bills/${b.id}/edit`} variant="secondary" icon="pencil">
                {t('edit')}
              </LinkButton>
              {billFile && (
                <a
                  href={`/api/documents/${billFile.doc.id}/file`}
                  target="_blank"
                  rel="noreferrer"
                  className="btn btn-glass"
                >
                  {t(
                    `files.${billFile.view === 'pdf' ? 'viewPdf' : billFile.view === 'photo' ? 'viewPhoto' : 'viewEmail'}`,
                  )}
                </a>
              )}
            </div>
          </Card>

          {housemates && asksMember(b.service, me) && (
            <Card id="whose" className="bg-accent-soft">
              <SectionHead title={t('whose.title')} />
              <p className="muted small">
                {t(personal ? 'whose.bodyMine' : 'whose.bodyHousehold', {
                  service: b.service.name,
                  split: splitWord,
                })}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
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
            <Card className="bg-danger-soft">
              <SectionHead title={t(`alert.${b.alertKind}`)} />
              <p className="small">
                {t(`alert.${b.alertKind}Body`, {
                  provider: b.service.provider,
                  date: b.alertAt ? date(b.alertAt) : '',
                })}
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                {b.alertDocumentId && (
                  <a href="#files" className="btn btn-plain btn-sm">
                    {t('alert.viewEmail')}
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

          {afterCancel && (
            <Notice
              tone="bad"
              icon="alert"
              title={t('page.afterCancelTitle', { service: b.service.name })}
              body={t('page.afterCancelBody', {
                date: date(b.service.cancelledAt!.slice(0, 10)),
              })}
              href={`/services/${b.service.id}`}
              className="bp-notice"
            />
          )}

          {unusual && (
            <Notice
              tone="warn"
              icon="trend-up"
              title={
                unusual.pct !== null
                  ? t(unusual.pct >= 0 ? 'page.unusualTitleHigher' : 'page.unusualTitleLower', {
                      pct: Math.round(Math.abs(unusual.pct) * 100),
                      basis: t(`page.basis.${unusual.basis ?? 'recent'}`),
                    })
                  : t('anomaly')
              }
              body={t('page.unusualBody', { service: b.service.name })}
              href={`/services/${b.service.id}`}
              className="bp-notice"
            />
          )}

          <Card>
            <SectionHead title={t('detail.detailsTitle')} />
            <Kv
              rows={[
                [
                  t('detail.period'),
                  <span key="p">
                    {formatPeriod(b.periodStart, b.periodEnd, hh.locale)}{' '}
                    <span className="muted">· {t('page.days', { days })}</span>
                  </span>,
                ],
                [t('detail.issueDate'), b.issueDate ? date(b.issueDate) : '—'],
                [
                  byInstalments && due.status.key !== 'paid'
                    ? t('plan.nextDue')
                    : t('detail.dueDate'),
                  <span key="d">
                    {date(due.status.dueDate)}
                    {due.status.key !== 'paid' && (
                      <span className="muted"> · {statusLabel(rc, due.status)}</span>
                    )}
                  </span>,
                ],
                [
                  t('detail.paidToProvider'),
                  paidAt
                    ? t('page.paidBy', {
                        date: date(paidAt),
                        who: personal ? t('page.you') : (payerName ?? t('page.someone')),
                      })
                    : byInstalments
                      ? t('page.instalmentsPaid', {
                          paid: b.instalments.filter((i) => i.paidToProviderAt).length,
                          of: b.instalments.length,
                        })
                      : t('page.notYet'),
                ],
                [
                  t('detail.externalRef'),
                  b.externalRef ? (
                    <span key="r" className="mono">
                      {b.externalRef}
                    </span>
                  ) : (
                    '—'
                  ),
                ],
                b.service.accountRef
                  ? [
                      t('detail.account'),
                      <span key="a" className="mono">
                        {b.service.accountRef}
                      </span>,
                    ]
                  : null,
                b.usageQuantity !== null
                  ? [
                      t('detail.usage'),
                      <span key="u">
                        {ctx.qty(b.usageQuantity)} {unitLabel(b.usageUnit)}{' '}
                        <span className="muted">
                          ·{' '}
                          {t('page.perDay', {
                            qty: ctx.qty(Math.round((b.usageQuantity / days) * 10) / 10),
                            unit: unitLabel(b.usageUnit),
                          })}
                        </span>
                      </span>,
                    ]
                  : null,
                b.taxMinor !== null
                  ? [
                      t('detail.taxRow'),
                      t('detail.includesTax', {
                        amount: money(b.taxMinor, b.currency),
                        label: b.taxLabel ?? t('detail.tax'),
                      }),
                    ]
                  : null,
                housemates
                  ? [
                      t('whose.label'),
                      t(personal ? 'whose.isMine' : 'whose.isHousehold', { split: splitWord }),
                    ]
                  : null,
              ]}
            />
            {notes && <p className="muted small mt-3 whitespace-pre-wrap">{notes}</p>}
            {housemates &&
              (!personal && housematesPaid(hh.id, b.serviceId) ? (
                <p className="muted small mt-3">{t('whose.lockedShares')}</p>
              ) : (
                mayChangeOwner(hh.id, me, b.service) && (
                  <div className="mt-3">
                    <InlineAction
                      action={setWhoseAction}
                      hidden={{ billId: b.id, whose: personal ? 'household' : 'mine' }}
                      label={personal ? t('whose.makeHousehold') : t('whose.makeMine')}
                      variant="secondary"
                      confirm={t(personal ? 'whose.confirmHousehold' : 'whose.confirmMine', {
                        service: b.service.name,
                        split: splitWord,
                      })}
                    />
                  </div>
                )
              ))}
          </Card>

          {split ? (
            <SharesCard bill={b} ctx={ctx} />
          ) : personal ? (
            <Card>
              <SectionHead title={t('page.justYours')} />
              <p className="muted small">{t('page.justYoursBody')}</p>
            </Card>
          ) : null}

          {b.instalments.length > 0 && (
            <PaymentPlan bill={b} canChoose={canChoosePlan(me, b)} ctx={ctx} />
          )}

          <FiguresCard bill={b} ctx={ctx} />

          {movable.length > 1 && (
            <Card>
              <MoveBill
                action={moveBillAction}
                billId={b.id}
                currentId={b.serviceId}
                targets={moveTargets}
              />
            </Card>
          )}

          <div className="flex justify-end">
            <InlineAction
              action={deleteBillAction}
              hidden={{ id: b.id }}
              label={t('delete')}
              variant="danger"
              confirm={t('deleteConfirm')}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
