import Link from 'next/link';
import { canExportHousehold } from '@/lib/export';
import { getTranslations } from 'next-intl/server';
import { ForwardAddress } from '@/components/app/forward-address';
import { SearchBar } from '@/components/app/search-bar';
import { Icon } from '@/components/app/icons';
import {
  Badge,
  Chip,
  DownloadButton,
  EmptyState,
  Figure,
  LinkButton,
  PageHeader,
  Tile,
} from '@/components/ui';
import { IconDisc, Swatch } from '@/components/ui/colour';
import { billsAddress } from '@/lib/bills-address';
import { listBills } from '@/lib/bills';
import { pageContext } from '@/lib/context';
import { listServices } from '@/lib/services';
import { Highlight } from '@/components/app/highlight';
import { groupByMonth } from '@/lib/bill-month';
import { billEntries, entryOverdue, filterBills } from '@/lib/bill-search';
import { listDocuments, searchDocuments } from '@/lib/review';

type Filter = 'all' | 'unpaid' | 'overdue' | 'unusual' | 'paid';
/** Household bills, my personal bills, or both. */
type Whose = 'all' | 'household' | 'mine';
const FILTERS: Filter[] = ['all', 'unpaid', 'overdue', 'unusual', 'paid'];

export default async function BillsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; f?: string; s?: string; y?: string; o?: string }>;
}) {
  const params = await searchParams;
  const q = (params.q ?? '').trim();
  const filter: Filter = (FILTERS as string[]).includes(params.f ?? '')
    ? (params.f as Filter)
    : 'all';
  const { hh, me, money, date, month, today } = await pageContext();
  const t = await getTranslations('bills');
  // The household's bills and this member's own (nobody else's personal bills).
  const everything = listBills(hh.id, { viewer: me.id });
  const hasPersonal = everything.some((b) => b.ownerMemberId);
  const whose: Whose =
    hasPersonal && (params.o === 'mine' || params.o === 'household') ? params.o : 'all';
  const all = everything.filter((b) =>
    whose === 'mine' ? b.ownerMemberId : whose === 'household' ? !b.ownerMemberId : true,
  );
  const services = listServices(hh.id, { includeInactive: true, viewer: me.id }).filter((svc) =>
    all.some((b) => b.serviceId === svc.id),
  );
  const serviceId = services.some((svc) => svc.id === params.s) ? params.s! : null;
  const years = [...new Set(all.flatMap(billEntries).map((e) => e.date.slice(0, 4)))]
    .sort()
    .reverse();
  const year = years.includes(params.y ?? '') ? params.y! : null;
  const hasServices = listServices(hh.id, { viewer: me.id }).length > 0;
  const address = billsAddress(hh);
  const { entries, tokens } = filterBills(
    all,
    { q, status: filter, serviceId, year },
    { locale: hh.locale, today },
  );
  // Grouped by month, newest first: the month a bill belongs to (see billMonth),
  // or, paid by instalments, the month each instalment is due.
  const groups = groupByMonth(entries, (e) => e.date);
  const total = entries.reduce((sum, e) => sum + e.amountMinor, 0);
  const unpaid = entries.filter((e) => !e.paidAt).reduce((sum, e) => sum + e.amountMinor, 0);
  // Links that change one filter and keep the rest.
  const href = (change: {
    f?: Filter;
    s?: string | null;
    y?: string | null;
    q?: string;
    o?: Whose;
  }) => {
    const next = { f: filter, s: serviceId, y: year, q, o: whose, ...change };
    const u = new URLSearchParams();
    if (next.o !== 'all') u.set('o', next.o);
    if (next.f && next.f !== 'all') u.set('f', next.f);
    if (next.s) u.set('s', next.s);
    if (next.y) u.set('y', next.y);
    if (next.q) u.set('q', next.q);
    const qs = u.toString();
    return qs ? `/bills?${qs}` : '/bills';
  };
  const filtered = filter !== 'all' || !!serviceId || !!year || !!q || whose !== 'all';
  const inboxMatches = q
    ? searchDocuments(listDocuments(hh.id, { viewer: me.id }), q, hh.locale).docs.length
    : 0;

  return (
    <>
      <PageHeader
        title={t('title')}
        subtitle={
          entries.length
            ? `${t('summary.count', { count: entries.length })} · ${t('summary.total', { amount: money(total) })}${unpaid ? ` · ${t('summary.unpaid', { amount: money(unpaid) })}` : ''}`
            : undefined
        }
        action={
          <span className="flex items-center gap-2">
            {/* Everything, zipped: spreadsheets plus every bill's file, filed by year,
                month and service. Admins get the household's; anyone, their own. */}
            {(canExportHousehold(me, hh) ? everything.length > 0 : hasPersonal) && (
              <DownloadButton
                href="/api/export?kind=zip"
                label={t(canExportHousehold(me, hh) ? 'download' : 'downloadMine')}
                title={t(canExportHousehold(me, hh) ? 'downloadHint' : 'downloadMineHint')}
                icon={<Icon name="download" width={16} height={16} />}
              />
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
          <SearchBar
            action="/bills"
            q={q}
            keep={{ f: filter !== 'all' ? filter : null, s: serviceId, y: year }}
            placeholder={t('search.placeholder')}
            label={t('search.label')}
            submit={t('search.submit')}
          />
          {hasPersonal && (
            <div className="flex flex-wrap items-center gap-2">
              {(['all', 'household', 'mine'] as const).map((o) => (
                <Chip key={o} href={href({ o })} active={whose === o}>
                  {t(`whoseFilter.${o}`)}
                </Chip>
              ))}
            </div>
          )}
          <div className="flex flex-wrap items-center gap-2">
            {FILTERS.map((nf) => (
              <Chip key={nf} href={href({ f: nf })} active={filter === nf}>
                {t(`filters.${nf}`)}
              </Chip>
            ))}
          </div>
          {services.length > 1 && (
            <div className="flex flex-wrap items-center gap-2">
              <Chip href={href({ s: null })} active={!serviceId}>
                {t('search.allServices')}
              </Chip>
              {services.map((svc) => (
                <Chip
                  key={svc.id}
                  href={href({ s: svc.id })}
                  active={serviceId === svc.id}
                  className="flex items-center gap-2"
                >
                  <Swatch colour={svc.colour} />
                  {svc.name}
                </Chip>
              ))}
            </div>
          )}
          {years.length > 1 && (
            <div className="flex flex-wrap items-center gap-2">
              <Chip href={href({ y: null })} active={!year}>
                {t('search.allYears')}
              </Chip>
              {years.map((y) => (
                <Chip key={y} href={href({ y })} active={year === y}>
                  {y}
                </Chip>
              ))}
            </div>
          )}
          {filtered && (
            <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-fg-muted">
              {q
                ? t('searchResults', { count: entries.length, q })
                : t('filterResults', { count: entries.length })}
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
      ) : entries.length === 0 ? (
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
        groups.map(([m, items]) => (
          <section key={m} className="mb-6">
            <h2 className="mb-3 flex flex-wrap items-baseline gap-x-3 font-display text-lg font-semibold">
              <Highlight text={month(m, 'long-year')} tokens={tokens} />
              <span className="font-sans text-xs font-normal text-fg-muted">
                {t('summary.count', { count: items.length })} ·{' '}
                {money(items.reduce((sum, e) => sum + e.amountMinor, 0))}
              </span>
            </h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {items.map((e) => {
                const b = e.bill;
                const overdue = entryOverdue(e, today);
                const sourceLabel = t(
                  `tile.source.${b.extractor === 'review' ? 'review' : b.source}`,
                );
                const shares = b.sharesByInstalment[e.instalment?.seq ?? 0];
                const sharePct = shares?.count
                  ? Math.round((shares.paid / shares.count) * 100)
                  : null;
                return (
                  <Tile
                    key={e.key}
                    href={`/bills/${b.id}${e.instalment ? '#plan' : ''}`}
                    tone={overdue ? 'danger' : 'plain'}
                    className="flex flex-col gap-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <span className="flex items-center gap-3">
                        <IconDisc
                          icon={b.service.type.icon}
                          colour={b.service.colour}
                          variant="glow"
                          size={44}
                        />
                        <span className="flex flex-col leading-tight">
                          <span className="font-display font-semibold">
                            <Highlight text={b.service.name} tokens={tokens} />
                          </span>
                          <span className="text-xs text-fg-muted">
                            <Highlight text={b.service.provider} tokens={tokens} />
                          </span>
                        </span>
                      </span>
                      {e.paidAt ? (
                        <Badge tone="success">{t('tile.paidProvider')}</Badge>
                      ) : overdue ? (
                        <Badge tone="danger">{t('tile.overdue')}</Badge>
                      ) : (
                        <Badge tone="warning">{t('tile.unpaid')}</Badge>
                      )}
                    </div>
                    <div>
                      <Figure size="sm" className="tracking-tight">
                        <Highlight text={money(e.amountMinor, b.currency)} tokens={tokens} />
                      </Figure>
                      <p className="mt-1.5 text-xs text-fg-muted">
                        {e.instalment
                          ? t('tile.instalment', { n: e.instalment.seq, of: e.instalment.of })
                          : t('tile.period', {
                              start: date(b.periodStart, 'short'),
                              end: date(b.periodEnd, 'short'),
                            })}{' '}
                        · {t('tile.due', { date: date(e.dueDate, 'short') })}
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
                          {t('tile.sharesBar', { paid: shares!.paid, total: shares!.count })}
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
                        {b.ownerMemberId && <Badge>{t('tile.onlyYou')}</Badge>}
                        {b.isAnomaly && <Badge tone="warning">{t('anomaly')}</Badge>}
                        {b.externalRef && (
                          <span className="font-mono text-fg-muted">
                            #<Highlight text={b.externalRef} tokens={tokens} />
                          </span>
                        )}
                      </span>
                    </div>
                  </Tile>
                );
              })}
            </div>
          </section>
        ))
      )}
    </>
  );
}
