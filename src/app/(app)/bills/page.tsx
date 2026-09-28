import Link from 'next/link';
import { dueNow, paysByInstalments, unpaidMinor } from '@/lib/instalments';
import { getTranslations } from 'next-intl/server';
import { ForwardAddress } from '@/components/app/forward-address';
import { Icon } from '@/components/app/icons';
import { Badge, EmptyState, LinkButton, PageHeader } from '@/components/ui';
import { billsAddress } from '@/lib/bills-address';
import { listBills, type BillListItem } from '@/lib/bills';
import { pageContext } from '@/lib/context';
import { darkVariant } from '@/lib/palette';
import { listServices } from '@/lib/services';
import { Highlight } from '@/components/app/highlight';
import { billDate, billMonth, monthLabel } from '@/lib/bill-month';
import { filterBills } from '@/lib/bill-search';
import { listDocuments, searchDocuments } from '@/lib/review';

type Filter = 'all' | 'unpaid' | 'overdue' | 'unusual' | 'paid';
const FILTERS: Filter[] = ['all', 'unpaid', 'overdue', 'unusual', 'paid'];

export default async function BillsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; f?: string; s?: string; y?: string }>;
}) {
  const params = await searchParams;
  const q = (params.q ?? '').trim();
  const filter: Filter = (FILTERS as string[]).includes(params.f ?? '')
    ? (params.f as Filter)
    : 'all';
  const { hh, me, money, date, today } = await pageContext();
  const t = await getTranslations('bills');
  const all = listBills(hh.id);
  const services = listServices(hh.id, { includeInactive: true }).filter((svc) =>
    all.some((b) => b.serviceId === svc.id),
  );
  const serviceId = services.some((svc) => svc.id === params.s) ? params.s! : null;
  const years = [...new Set(all.map((b) => billMonth(b).slice(0, 4)))].sort().reverse();
  const year = years.includes(params.y ?? '') ? params.y! : null;
  const hasServices = listServices(hh.id).length > 0;
  const address = billsAddress(hh);
  const isOverdue = (b: BillListItem) => !b.paidToProviderAt && b.dueDate < today;
  const { bills, tokens } = filterBills(
    all,
    { q, status: filter, serviceId, year },
    { locale: hh.locale, today },
  );
  // Grouped by the month each bill belongs to (see billMonth), newest first.
  const groups = new Map<string, BillListItem[]>();
  for (const b of [...bills].sort((a, c) => billDate(c).localeCompare(billDate(a))))
    groups.set(billMonth(b), [...(groups.get(billMonth(b)) ?? []), b]);
  const total = bills.reduce((sum, b) => sum + b.amountMinor, 0);
  const unpaid = bills
    .filter((b) => !b.paidToProviderAt)
    .reduce((sum, b) => sum + unpaidMinor(b), 0);
  // Links that change one filter and keep the rest.
  const href = (change: { f?: Filter; s?: string | null; y?: string | null; q?: string }) => {
    const next = { f: filter, s: serviceId, y: year, q, ...change };
    const u = new URLSearchParams();
    if (next.f && next.f !== 'all') u.set('f', next.f);
    if (next.s) u.set('s', next.s);
    if (next.y) u.set('y', next.y);
    if (next.q) u.set('q', next.q);
    const qs = u.toString();
    return qs ? `/bills?${qs}` : '/bills';
  };
  const filtered = filter !== 'all' || !!serviceId || !!year || !!q;
  const inboxMatches = q ? searchDocuments(listDocuments(hh.id), q, hh.locale).docs.length : 0;
  const chip = (on: boolean) =>
    `rounded-full px-4 py-2 text-sm font-semibold transition ${on ? 'bg-accent text-accent-fg' : 'bg-surface-2 text-fg-muted hover:text-fg'}`;

  return (
    <>
      <PageHeader
        title={t('title')}
        subtitle={
          bills.length
            ? `${t('summary.count', { count: bills.length })} · ${t('summary.total', { amount: money(total) })}${unpaid ? ` · ${t('summary.unpaid', { amount: money(unpaid) })}` : ''}`
            : undefined
        }
        action={
          <span className="flex items-center gap-2">
            {me.role === 'owner' && all.length > 0 && (
              <a
                href="/api/export?kind=bills"
                className="glass hidden items-center rounded-full px-4 py-2 text-sm font-semibold text-fg hover:bg-surface-2 sm:inline-flex"
              >
                {t('download')}
              </a>
            )}
            <LinkButton href="/bills/upload" variant="secondary">
              {t('tile.upload')}
            </LinkButton>
            {hasServices && <LinkButton href="/bills/new">{t('add')}</LinkButton>}
          </span>
        }
      />
      {address && <ForwardAddress address={address} />}

      {all.length > 0 && (
        <div className="mb-5 flex flex-col gap-3">
          <form action="/bills" className="flex gap-2">
            {filter !== 'all' && <input type="hidden" name="f" value={filter} />}
            {serviceId && <input type="hidden" name="s" value={serviceId} />}
            {year && <input type="hidden" name="y" value={year} />}
            <input
              type="search"
              name="q"
              defaultValue={q}
              placeholder={t('search.placeholder')}
              aria-label={t('search.label')}
              className="min-w-0 flex-1 rounded-full border border-border-strong bg-surface-2 px-4 py-2 text-sm outline-none focus:border-accent"
            />
            <button type="submit" className={chip(false)}>
              {t('search.submit')}
            </button>
          </form>
          <div className="flex flex-wrap items-center gap-2">
            {FILTERS.map((nf) => (
              <Link key={nf} href={href({ f: nf })} className={chip(filter === nf)}>
                {t(`filters.${nf}`)}
              </Link>
            ))}
          </div>
          {services.length > 1 && (
            <div className="flex flex-wrap items-center gap-2">
              <Link href={href({ s: null })} className={chip(!serviceId)}>
                {t('search.allServices')}
              </Link>
              {services.map((svc) => (
                <Link
                  key={svc.id}
                  href={href({ s: svc.id })}
                  className={`${chip(serviceId === svc.id)} flex items-center gap-2`}
                >
                  <span
                    className="size-2.5 rounded-sm"
                    style={{ background: `light-dark(${svc.colour}, ${darkVariant(svc.colour)})` }}
                  />
                  {svc.name}
                </Link>
              ))}
            </div>
          )}
          {years.length > 1 && (
            <div className="flex flex-wrap items-center gap-2">
              <Link href={href({ y: null })} className={chip(!year)}>
                {t('search.allYears')}
              </Link>
              {years.map((y) => (
                <Link key={y} href={href({ y })} className={chip(year === y)}>
                  {y}
                </Link>
              ))}
            </div>
          )}
          {filtered && (
            <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-fg-muted">
              {q
                ? t('searchResults', { count: bills.length, q })
                : t('filterResults', { count: bills.length })}
              <Link href="/bills" className="font-semibold text-accent">
                {t('clearSearch')}
              </Link>
              {inboxMatches > 0 && (
                <Link
                  href={`/review?f=all&q=${encodeURIComponent(q)}`}
                  className="font-semibold text-accent"
                >
                  {t('search.inInbox', { count: inboxMatches })}
                </Link>
              )}
            </p>
          )}
        </div>
      )}

      {all.length === 0 ? (
        <EmptyState
          title={t('empty.title')}
          body={hasServices ? t('empty.body') : t('empty.noServices')}
          action={
            <LinkButton href={hasServices ? '/bills/new' : '/services/new'}>
              {hasServices ? t('add') : t('empty.addService')}
            </LinkButton>
          }
        />
      ) : bills.length === 0 ? (
        <EmptyState
          title={t('empty.noMatch')}
          body={q ? t('searchResults', { count: 0, q }) : t('filterResults', { count: 0 })}
          action={
            <LinkButton href="/bills" variant="secondary">
              {t('clearSearch')}
            </LinkButton>
          }
        />
      ) : (
        [...groups.entries()].map(([m, items]) => (
          <section key={m} className="mb-6">
            <h2 className="mb-3 flex flex-wrap items-baseline gap-x-3 font-display text-lg font-semibold">
              <Highlight text={monthLabel(m, hh.locale)} tokens={tokens} />
              <span className="font-sans text-xs font-normal text-fg-muted">
                {t('summary.count', { count: items.length })} ·{' '}
                {money(items.reduce((sum, b) => sum + b.amountMinor, 0))}
              </span>
            </h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {items.map((b) => {
                const overdue = isOverdue(b);
                const swatch = `light-dark(${b.service.colour}, ${darkVariant(b.service.colour)})`;
                const sourceLabel =
                  b.extractor === 'review'
                    ? t('tile.source.review')
                    : b.source === 'manual'
                      ? t('tile.source.manual')
                      : t(`tile.source.${b.source}`, {
                          pct: Math.round((b.confidence ?? 0) * 100),
                        });
                const sharePct = b.shareCount
                  ? Math.round((b.paidShareCount / b.shareCount) * 100)
                  : null;
                return (
                  <Link
                    key={b.id}
                    href={`/bills/${b.id}`}
                    className={`glass lift flex flex-col gap-3 rounded-card p-5 text-fg ${overdue ? 'bg-danger-soft' : ''}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <span className="flex items-center gap-3">
                        <span
                          className="glow-disc size-11"
                          style={{ color: swatch, ['--glow' as string]: swatch }}
                        >
                          <Icon name={b.service.type.icon} width={20} height={20} />
                        </span>
                        <span className="flex flex-col leading-tight">
                          <span className="font-display font-semibold">
                            <Highlight text={b.service.name} tokens={tokens} />
                          </span>
                          <span className="text-xs text-fg-muted">
                            <Highlight text={b.service.provider} tokens={tokens} />
                          </span>
                        </span>
                      </span>
                      {b.paidToProviderAt ? (
                        <Badge tone="success">{t('tile.paidProvider')}</Badge>
                      ) : overdue ? (
                        <Badge tone="danger">{t('tile.overdue')}</Badge>
                      ) : (
                        <Badge tone="warning">{t('tile.unpaid')}</Badge>
                      )}
                    </div>
                    <div>
                      <p className="font-display text-[32px] leading-none font-semibold tracking-tight tabular-nums">
                        <Highlight text={money(b.amountMinor, b.currency)} tokens={tokens} />
                      </p>
                      <p className="mt-1.5 text-xs text-fg-muted">
                        {t('tile.period', {
                          start: date(b.periodStart, 'short'),
                          end: date(b.periodEnd, 'short'),
                        })}{' '}
                        · {t('due')} {date(b.dueDate, 'short')}
                        {paysByInstalments(b) &&
                          ` · ${t('tile.instalment', { n: dueNow(b).seq!, of: dueNow(b).of })}`}
                      </p>
                    </div>
                    {hh.splitMode === 'shared' && sharePct !== null && (
                      <div>
                        <div className="h-1.5 rounded-full bg-surface-2">
                          <div
                            className="h-1.5 rounded-full bg-accent"
                            style={{ width: `${Math.max(sharePct, 3)}%` }}
                          />
                        </div>
                        <p className="mt-1 text-[11px] text-fg-muted">
                          {t('tile.sharesBar', { paid: b.paidShareCount, total: b.shareCount })}
                        </p>
                      </div>
                    )}
                    <div className="flex items-center justify-between rounded-2xl border border-border-strong bg-surface-2 px-3 py-2 text-xs">
                      <span className="flex items-center gap-2 text-fg-muted">
                        <span
                          className={`size-1.5 rounded-full ${b.sourceDocumentId ? 'bg-accent' : 'bg-fg-muted'}`}
                        />
                        {sourceLabel}
                      </span>
                      <span className="flex items-center gap-2">
                        {b.alertKind && <Badge tone="danger">{t(`alert.${b.alertKind}`)}</Badge>}
                        {b.isAnomaly && <Badge tone="warning">{t('anomaly')}</Badge>}
                        {b.externalRef && (
                          <span className="font-mono text-fg-muted">
                            #<Highlight text={b.externalRef} tokens={tokens} />
                          </span>
                        )}
                      </span>
                    </div>
                  </Link>
                );
              })}
            </div>
          </section>
        ))
      )}
    </>
  );
}
