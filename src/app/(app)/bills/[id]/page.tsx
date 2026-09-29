import type { SourceDocument } from '@/db/schema';
import { asksMember } from '@/lib/ownership';
import { Icon } from '@/components/app/icons';
import { actingMember } from '@/ingest/pipeline';
import { canRotate } from '@/ingest/rotate';
import { isImageFile } from '@/ingest/scan';
import { filedDocuments, type FiledDocument } from '@/lib/filing';
import { listMembers } from '@/lib/members';
import { darkVariant } from '@/lib/palette';
import { visibleTo } from '@/lib/scope';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { Badge, Card, LinkButton } from '@/components/ui';
import { InlineAction } from '@/components/ui/form';
import { getBill } from '@/lib/bills';
import { pageContext } from '@/lib/context';
import { formatMoney } from '@/lib/format';
import { unitLabel } from '@/lib/units';
import { listBillMetrics } from '@/lib/metrics';
import { figureChanges } from '@/lib/consumption';
import { ChangeText } from '@/components/app/usage';
import { METRIC_KINDS } from '@/db/schema';
import { dueNow, fullPaymentOpen, paysByInstalments } from '@/lib/instalments';
import {
  clearBillAlertAction,
  answerOwnershipAction,
  deleteBillAction,
  rotateDocumentAction,
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
  // Another member's personal bill doesn't exist, as far as anyone else can tell.
  if (!b || !visibleTo(b.ownerMemberId, me.id)) notFound();
  const personal = !!b.ownerMemberId;
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

  // Everything that came with this bill: the file it was read from, then any
  // receipts and payment notices about it (one page per bill).
  const files = filedDocuments(hh.id, { everyone: true })
    .filter((f) => f.billId === b.id)
    .sort((x, y) =>
      x.kind === 'bill'
        ? -1
        : y.kind === 'bill'
          ? 1
          : x.doc.receivedAt.localeCompare(y.doc.receivedAt),
    );
  const members = new Map(listMembers(hh.id).map((m) => [m.id, m.name]));
  const notes = personNotes(b.notes, files.find((f) => f.kind === 'bill')?.doc ?? null);
  const swatch = `light-dark(${b.service.colour}, ${darkVariant(b.service.colour)})`;
  const dueNext = byInstalments ? dueNow(b) : null;

  return (
    <div className="mx-auto max-w-4xl">
      <header className="mb-5 flex flex-wrap items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-4">
          <span
            className="glow-disc size-14 shrink-0"
            style={{ color: swatch, ['--glow' as string]: swatch }}
          >
            <Icon name={b.service.type.icon} width={24} height={24} />
          </span>
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

      {hh.splitMode === 'shared' && asksMember(b.service, me) && (
        <Card className="mb-4 flex flex-col gap-3 border-accent/40 bg-accent-soft" id="whose">
          <div>
            <p className="font-display text-lg font-semibold">{t('whose.title')}</p>
            <p className="text-sm text-fg-muted">
              {t(personal ? 'whose.bodyMine' : 'whose.bodyHousehold', {
                service: b.service.name,
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
                {t('alert.viewEmail')} ↓
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
            <p className="font-display text-[44px] leading-none font-semibold tracking-tight tabular-nums">
              {money(b.amountMinor, b.currency)}
            </p>
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
          <p className="mt-4 rounded-xl bg-warning/10 px-4 py-3 text-sm text-warning">
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
              label={byInstalments ? tp('nextDue') : t('detail.dueDate')}
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
                b.usageQuantity !== null ? `${b.usageQuantity} ${unitLabel(b.usageUnit)}` : '—'
              }
            />
            <Row label={t('detail.paidToProviderAt')} value={date(b.paidToProviderAt) || '—'} />
            <Row label={t('detail.type')} value={b.service.type.label} />
          </dl>
          {notes && <p className="mt-4 text-sm whitespace-pre-wrap text-fg-muted">{notes}</p>}
        </Card>

        {/* The email and file it came from, and anything since. */}
        <Card className="scroll-mt-24" id="files">
          <h2 className="font-display text-lg font-semibold">{t('files.title')}</h2>
          {files.length === 0 ? (
            <p className="mt-3 text-sm text-fg-muted">
              {b.source === 'manual' && !b.sourceDocumentId ? t('files.byHand') : t('files.none')}
            </p>
          ) : (
            <ul className="mt-3 flex flex-col divide-y divide-border">
              {files.map((f) => (
                <FileRow
                  key={f.doc.id}
                  file={f}
                  billId={b.id}
                  sentBy={sentBy(hh.id, f.doc, members)}
                  date={date}
                  t={t}
                />
              ))}
            </ul>
          )}
        </Card>
      </div>

      {b.instalments.length > 0 && (
        <PaymentPlan
          bill={b}
          canChoose={
            personal
              ? b.ownerMemberId === me.id
              : me.role === 'owner' || b.service.payerMemberId === me.id
          }
          today={today}
          money={money}
          date={date}
          t={tp}
        />
      )}

      {personal && (
        <p className="mt-4 rounded-card bg-surface-2 px-5 py-3 text-sm text-fg-muted">
          {t('detail.personalNote')}
        </p>
      )}

      {hh.splitMode === 'shared' && !personal && (
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

/**
 * A bill's notes as a person wrote them. Bills read by the AI used to carry the
 * reader's own remarks in their notes; those aren't for people, so notes that
 * are exactly what the reader said about its source file are left out.
 */
function personNotes(notes: string | null, source: SourceDocument | null): string | null {
  if (!notes?.trim()) return null;
  try {
    const read = source?.extractionJson
      ? (JSON.parse(source.extractionJson) as { result?: { warnings?: string[] } })
      : null;
    const said = read?.result?.warnings ?? [];
    if (said.length && said.join('\n').trim() === notes.trim()) return null;
  } catch {
    // Unreadable record: show the notes.
  }
  return notes;
}

type SentBy =
  | { kind: 'upload'; name: string | null }
  | { kind: 'forward'; name: string; from: string | null }
  | { kind: 'email'; from: string | null };

/** How a file reached the household: uploaded, forwarded by a member, or emailed in. */
function sentBy(householdId: string, doc: SourceDocument, members: Map<string, string>): SentBy {
  if (doc.kind === 'upload')
    return { kind: 'upload', name: (doc.memberId && members.get(doc.memberId)) || null };
  const member = actingMember(householdId, doc);
  if (member) return { kind: 'forward', name: members.get(member) ?? '', from: doc.emailFrom };
  return { kind: 'email', from: doc.emailFrom };
}

/** One file that came with the bill: who sent it, its email details, and a link to open it. */
function FileRow({
  file: f,
  billId,
  sentBy: who,
  date,
  t,
}: {
  file: FiledDocument;
  billId: string;
  sentBy: SentBy;
  date: (iso: string | null | undefined, style?: 'short' | 'medium') => string;
  t: Translate;
}) {
  const doc = f.doc;
  const isPdf = (doc.mimeType ?? '').includes('pdf') || doc.path.toLowerCase().endsWith('.pdf');
  const isPhoto = isImageFile(doc.mimeType, doc.path);
  const when = date(doc.receivedAt);
  const line =
    who.kind === 'upload'
      ? who.name
        ? t('files.uploadedBy', { name: who.name, date: when })
        : t('files.uploaded', { date: when })
      : who.kind === 'forward'
        ? t('files.forwardedBy', { name: who.name, date: when })
        : t('files.emailed', { date: when });
  return (
    <li className="flex flex-col gap-1.5 py-3 first:pt-0 last:pb-0">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold">{t(`files.kind.${f.kind}`)}</p>
          <p className="text-xs text-fg-muted">{line}</p>
        </div>
        {doc.senderVerified === true && doc.senderDomain && (
          <Badge tone="success">{t('files.signed', { domain: doc.senderDomain })}</Badge>
        )}
      </div>
      {doc.emailSubject && <p className="text-sm">{doc.emailSubject}</p>}
      {doc.emailFrom && (
        <p className="truncate text-xs text-fg-muted">{t('files.from', { from: doc.emailFrom })}</p>
      )}
      {doc.originalFilename && (
        <p className="truncate font-mono text-xs text-fg-muted">{doc.originalFilename}</p>
      )}
      <div className="mt-1 flex flex-wrap items-center gap-2">
        <a
          href={`/api/documents/${doc.id}/file`}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 rounded-full border border-border-strong bg-surface-2 px-4 py-2 text-sm font-semibold hover:bg-surface"
        >
          {isPdf ? t('files.viewPdf') : isPhoto ? t('files.viewPhoto') : t('files.viewEmail')} ↗
        </a>
        {canRotate(doc) && (
          <InlineAction
            action={rotateDocumentAction}
            hidden={{ id: doc.id, billId }}
            label={t('files.turn')}
            variant="ghost"
          />
        )}
      </div>
    </li>
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
