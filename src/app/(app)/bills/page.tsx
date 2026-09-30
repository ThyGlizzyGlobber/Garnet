import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { Icon } from '@/components/app/icons';
import { billRowFor, rowCtx } from '@/components/app/bill-rows';
import { Highlight } from '@/components/app/highlight';
import { Card, FilterChip, LinkButton } from '@/components/ui';
import { EmptyCard, PageTitle } from '@/components/ui/blocks';
import { Segmented, SearchField } from '@/components/ui/controls';
import { BillRow, Rows } from '@/components/ui/rows';
import { Swatch } from '@/components/ui/colour';
import { billsAddress } from '@/lib/bills-address';
import { listBills } from '@/lib/bills';
import { pageContext } from '@/lib/context';
import { canExportHousehold } from '@/lib/export';
import { listServices } from '@/lib/services';
import { groupByMonth } from '@/lib/bill-month';
import { billEntry, filterBills } from '@/lib/bill-search';
import { listDocuments, searchDocuments } from '@/lib/review';
import { CopyButton } from '@/components/ui/copy';

type Filter = 'all' | 'unpaid' | 'paid' | 'unusual' | 'overdue';
/** Household bills, my personal bills, or both. */
type Whose = 'all' | 'household' | 'mine';
const FILTERS: Filter[] = ['all', 'unpaid', 'paid', 'unusual'];

/**
 * Bills, filed by the month each belongs to (billDate), one row per bill (a
 * bill paid by instalments carries its next instalment). The numbers come
 * from filterBills; the rows from billRowFor.
 */
export default async function BillsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; f?: string; s?: string; y?: string; o?: string }>;
}) {
  const params = await searchParams;
  const q = (params.q ?? '').trim();
  const filter: Filter = ([...FILTERS, 'overdue'] as string[]).includes(params.f ?? '')
    ? (params.f as Filter)
    : 'all';
  const ctx = await pageContext();
  const { hh, me, money, month } = ctx;
  const t = await getTranslations('bills');
  const tu = await getTranslations('ui');
  const rc = rowCtx(ctx, tu);
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
  const years = [...new Set(all.map(billEntry).map((e) => e.date.slice(0, 4)))].sort().reverse();
  const year = years.includes(params.y ?? '') ? params.y! : null;
  const hasServices = listServices(hh.id, { viewer: me.id }).length > 0;
  const address = billsAddress(hh);
  const { entries, tokens } = filterBills(
    all,
    { q, status: filter, serviceId, year },
    { locale: hh.locale, today: ctx.today },
  );
  const groups = groupByMonth(entries, (e) => e.date);
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
  const canExport = canExportHousehold(me, hh) ? everything.length > 0 : hasPersonal;

  if (all.length === 0)
    return (
      <div className="scr">
        <PageTitle title={t('title')} lede={t('lede')} />
        <EmptyCard
          icon="bills"
          title={t('empty.title')}
          body={hasServices ? t('empty.body') : t('empty.noServices')}
        >
          {address && (
            <CopyButton
              value={address}
              label={t('empty.copyAddress')}
              className="btn btn-primary"
            />
          )}
          <LinkButton href="/bills/upload" variant="secondary" icon="upload">
            {t('tile.upload')}
          </LinkButton>
          <LinkButton href={hasServices ? '/bills/new' : '/services/new'} variant="ghost">
            {hasServices ? t('empty.byHand') : t('empty.addService')}
          </LinkButton>
        </EmptyCard>
      </div>
    );

  return (
    <div className="scr d3-billsl">
      <PageTitle
        title={t('title')}
        lede={t('lede')}
        right={
          <>
            {canExport && (
              <a
                href="/api/export?kind=zip"
                download
                className="btn btn-glass btn-sm"
                title={t(canExportHousehold(me, hh) ? 'downloadHint' : 'downloadMineHint')}
                aria-label={t(canExportHousehold(me, hh) ? 'download' : 'downloadMine')}
              >
                <Icon name="download" width={15} height={15} />
                <span className="hidden sm:inline">
                  {t(canExportHousehold(me, hh) ? 'download' : 'downloadMine')}
                </span>
              </a>
            )}
            <Segmented
              small
              label={t('filters.label')}
              value={filter}
              items={FILTERS.map((f) => ({
                value: f,
                label: t(`filters.${f}`),
                href: href({ f }),
              }))}
            />
          </>
        }
      />
      <div className="filters">
        <form action="/bills" method="get" className="contents">
          {whose !== 'all' && <input type="hidden" name="o" value={whose} />}
          {filter !== 'all' && <input type="hidden" name="f" value={filter} />}
          {serviceId && <input type="hidden" name="s" value={serviceId} />}
          {year && <input type="hidden" name="y" value={year} />}
          <SearchField
            small
            placeholder={t('search.placeholder')}
            label={t('search.label')}
            defaultValue={q}
            className="w-full sm:w-72"
          />
        </form>
        {hasPersonal && (
          <Segmented
            small
            label={t('whoseFilter.label')}
            value={whose}
            items={(['all', 'household', 'mine'] as const).map((o) => ({
              value: o,
              label: t(`whoseFilter.${o}`),
              href: href({ o }),
            }))}
          />
        )}
        {services.length > 1 &&
          services.map((svc) => (
            <FilterChip
              key={svc.id}
              href={href({ s: serviceId === svc.id ? null : svc.id })}
              active={serviceId === svc.id}
              className="flex items-center gap-2"
            >
              <Swatch colour={svc.colour} />
              {svc.name}
            </FilterChip>
          ))}
        {years.length > 1 &&
          years.map((y) => (
            <FilterChip key={y} href={href({ y: year === y ? null : y })} active={year === y}>
              {y}
            </FilterChip>
          ))}
      </div>
      {filtered && (
        <p className="muted small -mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
          {q
            ? t('searchResults', { count: entries.length, q })
            : t('filterResults', { count: entries.length })}
          <Link href="/bills" className="font-semibold text-accent">
            {t('clearSearch')}
          </Link>
          {inboxMatches > 0 && (
            <Link
              href={`/inbox?f=all&q=${encodeURIComponent(q)}`}
              className="font-semibold text-accent"
            >
              {t('search.inInbox', { count: inboxMatches })}
            </Link>
          )}
        </p>
      )}

      {entries.length === 0 ? (
        <EmptyCard
          icon="search"
          title={t('empty.noMatch')}
          body={q ? t('searchResults', { count: 0, q }) : t('filterResults', { count: 0 })}
        >
          <LinkButton href="/bills" variant="secondary">
            {t('clearSearch')}
          </LinkButton>
        </EmptyCard>
      ) : (
        groups.map(([m, items]) => (
          <section key={m} className="d3-month">
            <div className="d3-month-h">
              <h2>
                <Highlight text={month(m, 'long')} tokens={tokens} />
              </h2>
              <span className="muted">
                {m.slice(0, 4)} · {t('summary.count', { count: items.length })} ·{' '}
                {money(
                  items.reduce((sum, e) => sum + (e.bill.ownerMemberId ? 0 : e.amountMinor), 0),
                  hh.currency,
                  { whole: true },
                )}
              </span>
            </div>
            <Card className="p-2">
              <Rows>
                {items.map((e) => (
                  <BillRow
                    key={e.bill.id}
                    bill={billRowFor(e.bill, rc, { share: hh.splitMode === 'shared' })}
                  />
                ))}
              </Rows>
            </Card>
          </section>
        ))
      )}
    </div>
  );
}
