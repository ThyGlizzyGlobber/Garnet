import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { Icon } from '@/components/app/icons';
import { PopoverClose } from '@/components/app/popover-close';
import { billRowFor, rowCtx, upcomingRowFor } from '@/components/app/bill-rows';
import { Highlight } from '@/components/app/highlight';
import { Button, Card, Field, LinkButton, Select } from '@/components/ui';
import { EmptyCard, PageTitle } from '@/components/ui/blocks';
import { Segmented, SearchField } from '@/components/ui/controls';
import { BillRow, Rows, type BillRowModel } from '@/components/ui/rows';
import { billsAddress } from '@/lib/bills-address';
import { listBills } from '@/lib/bills';
import { pageContext } from '@/lib/context';
import { canExportHousehold } from '@/lib/export';
import { groupServices, listServices } from '@/lib/services';
import { groupByMonth } from '@/lib/bill-month';
import { billEntry, filterBills } from '@/lib/bill-search';
import { listDocuments, searchDocuments } from '@/lib/review';
import { CopyButton } from '@/components/ui/copy';
import { Pager } from '@/components/ui/pager';
import { pageParam, paginateGroups } from '@/lib/paging';
import { upcomingCharge } from '@/lib/recurring';
import { matchesAll } from '@/lib/search';

type Filter = 'all' | 'unpaid' | 'paid' | 'unusual' | 'overdue';
/** Household bills, my personal bills, or both. */
type Whose = 'all' | 'household' | 'mine';
/** One row in the list: a bill, or a recurring service's upcoming charge. */
interface ListItem {
  key: string;
  /** The day it's filed under. */
  date: string;
  amountMinor: number;
  /** Someone's own: left out of the month's household total. */
  personal: boolean;
  row: BillRowModel;
}
/** Up to this month (the default), the months after it, or every month. */
type When = 'now' | 'upcoming' | 'all';
const FILTERS: Filter[] = ['all', 'unpaid', 'paid', 'unusual'];
/** About this many bills a page; a month is never split across pages. */
const BILLS_PER_PAGE = 30;

/**
 * Bills, filed by the month each belongs to (billDate), one row per bill (a
 * bill paid by instalments carries its next instalment). The numbers come
 * from filterBills; the rows from billRowFor.
 */
export default async function BillsPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    f?: string;
    s?: string;
    y?: string;
    o?: string;
    /** Which months: up to this one (default), upcoming, or all. */
    w?: string;
    /** A main service's sub-services together (Subscriptions), by type. */
    t?: string;
    /** The Filters panel's service: s:<id> or t:<main service>. */
    sv?: string;
    /** Page number (whole months, about BILLS_PER_PAGE bills a page). */
    p?: string;
    /** From the top bar's search icon: the search field is focused. */
    find?: string;
  }>;
}) {
  const raw = await searchParams;
  // The Filters panel sends its service as one field; links send s= or t=.
  const params =
    raw.sv !== undefined
      ? {
          ...raw,
          s: raw.sv.startsWith('s:') ? raw.sv.slice(2) : undefined,
          t: raw.sv.startsWith('t:') ? raw.sv.slice(2) : undefined,
        }
      : raw;
  const q = (params.q ?? '').trim();
  const filter: Filter = ([...FILTERS, 'overdue'] as string[]).includes(params.f ?? '')
    ? (params.f as Filter)
    : 'all';
  const ctx = await pageContext();
  const { hh, me, money, month } = ctx;
  const t = await getTranslations('bills');
  const tu = await getTranslations('ui');
  const tp = await getTranslations('ui.pager');
  const ta = await getTranslations('main');
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
  // A main service's sub-services are one chip (Subscriptions); picking it
  // shows a chip for each of them.
  // Vehicles and Health are one chip each too (t=vehicle), their services under it.
  const serviceGroups = groupServices(services);
  const groupKey = (g: (typeof serviceGroups)[number]) => g.typeSlug ?? g.category;
  const picked = serviceGroups.find((g) => groupKey(g) && groupKey(g) === params.t);
  const typeSlug = picked ? params.t! : null;
  const category = picked?.category ?? null;
  const when: When = params.w === 'upcoming' || params.w === 'all' ? params.w : 'now';
  const years = [...new Set(all.map(billEntry).map((e) => e.date.slice(0, 4)))].sort().reverse();
  const year = years.includes(params.y ?? '') ? params.y! : null;
  const hasServices = listServices(hh.id, { viewer: me.id }).length > 0;
  const address = billsAddress(hh);
  const {
    entries,
    tokens,
    later: laterBills,
  } = filterBills(
    all,
    { q, status: filter, serviceId, year, when, typeSlug: category ? null : typeSlug, category },
    { locale: hh.locale, today: ctx.today },
  );
  // Recurring services' next charges (not bills yet), filed like bills and
  // passing the same filters: shown as "Upcoming" at the latest price.
  const thisMonth = ctx.today.slice(0, 7);
  const upcoming = listServices(hh.id, { viewer: me.id })
    .filter((svc) =>
      whose === 'mine' ? svc.ownerMemberId : whose === 'household' ? !svc.ownerMemberId : true,
    )
    .filter(
      (svc) =>
        (!serviceId || svc.id === serviceId) &&
        (!typeSlug || (category ? svc.type.category === category : svc.typeSlug === typeSlug)),
    )
    .flatMap((svc) => {
      const charge = upcomingCharge(
        svc,
        everything.filter((b) => b.serviceId === svc.id),
      );
      if (!charge || filter === 'paid' || filter === 'unusual' || filter === 'overdue') return [];
      if (year && charge.periodStart.slice(0, 4) !== year) return [];
      const hay = `${svc.name} ${svc.provider} ${svc.type.label} upcoming recurring`.toLowerCase();
      if (tokens.length && !matchesAll(hay, tokens)) return [];
      return [{ svc, charge, date: charge.periodStart }];
    });
  const upcomingLater = upcoming.filter((u) => u.date.slice(0, 7) > thisMonth);
  const shownUpcoming = upcoming.filter((u) =>
    when === 'all'
      ? true
      : when === 'upcoming'
        ? u.date.slice(0, 7) > thisMonth
        : u.date.slice(0, 7) <= thisMonth,
  );
  const later = laterBills + upcomingLater.length;
  // Bills and upcoming charges as one list of rows.
  const items: ListItem[] = [
    ...entries.map((e) => ({
      key: e.bill.id,
      date: e.date,
      amountMinor: e.amountMinor,
      personal: !!e.bill.ownerMemberId,
      row: billRowFor(e.bill, rc, { share: hh.splitMode === 'shared' }),
    })),
    ...shownUpcoming.map((u) => ({
      key: `up-${u.svc.id}`,
      date: u.date,
      amountMinor: u.charge.amountMinor,
      personal: !!u.svc.ownerMemberId,
      row: upcomingRowFor(u.charge, u.svc, rc, { personal: !!u.svc.ownerMemberId }),
    })),
  ];
  const groups = groupByMonth(items, (e) => e.date);
  // Coming up reads soonest first; everything else latest first.
  if (when === 'upcoming') groups.reverse();
  const paged = paginateGroups(
    groups,
    ([, items]) => items.length,
    pageParam(params.p),
    BILLS_PER_PAGE,
  );
  // Links that change one filter and keep the rest.
  const href = (change: {
    f?: Filter;
    s?: string | null;
    y?: string | null;
    q?: string;
    o?: Whose;
    w?: When;
    t?: string | null;
    /** Any other change starts again at the first page. */
    p?: number;
  }) => {
    const next = { f: filter, s: serviceId, y: year, q, o: whose, w: when, t: typeSlug, ...change };
    const u = new URLSearchParams();
    if (next.o !== 'all') u.set('o', next.o);
    if (next.w !== 'now') u.set('w', next.w);
    if (next.t) u.set('t', next.t);
    if (next.f && next.f !== 'all') u.set('f', next.f);
    if (next.s) u.set('s', next.s);
    if (next.y) u.set('y', next.y);
    if (next.q) u.set('q', next.q);
    if (change.p && change.p > 1) u.set('p', String(change.p));
    const qs = u.toString();
    return qs ? `/bills?${qs}` : '/bills';
  };
  const filtered =
    filter !== 'all' || !!serviceId || !!typeSlug || !!year || !!q || whose !== 'all';
  // The Filters panel: what it has set, as pills that each take one away.
  const pickedService = services.find((svc) => svc.id === serviceId);
  const groupName = (g: (typeof serviceGroups)[number]) =>
    g.category ? ta(`main.${g.category}`) : g.label;
  const pills = [
    typeSlug && picked ? { key: 't', label: groupName(picked), href: href({ t: null }) } : null,
    pickedService ? { key: 's', label: pickedService.name, href: href({ s: null }) } : null,
    year ? { key: 'y', label: year, href: href({ y: null }) } : null,
    whose !== 'all'
      ? { key: 'o', label: t(`whoseFilter.${whose}`), href: href({ o: 'all' }) }
      : null,
    when !== 'now' ? { key: 'w', label: t(`when.${when}`), href: href({ w: 'now' }) } : null,
  ].filter((x): x is { key: string; label: string; href: string } => !!x);
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
          canExport && (
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
          )
        }
      />
      {/* One bar: search, what to show, and the rest behind Filters. */}
      <div className="bf-bar">
        <form action="/bills" method="get" className="bf-search">
          {whose !== 'all' && <input type="hidden" name="o" value={whose} />}
          {filter !== 'all' && <input type="hidden" name="f" value={filter} />}
          {when !== 'now' && <input type="hidden" name="w" value={when} />}
          {typeSlug && <input type="hidden" name="t" value={typeSlug} />}
          {serviceId && <input type="hidden" name="s" value={serviceId} />}
          {year && <input type="hidden" name="y" value={year} />}
          <SearchField
            small
            autoFocus={!!raw.find}
            placeholder={t('search.placeholder')}
            label={t('search.label')}
            defaultValue={q}
            className="w-full"
          />
        </form>
        <Segmented
          small
          label={t('filters.label')}
          value={filter}
          className="bf-status"
          items={FILTERS.map((f) => ({
            value: f,
            label: t(`filters.${f}`),
            href: href({ f }),
          }))}
        />
        <details className="bf-more" data-popover>
          <PopoverClose />
          <summary className={`btn btn-glass btn-sm${pills.length ? ' is-on' : ''}`}>
            <Icon name="sliders" width={15} height={15} />
            {t('filters.more')}
            {pills.length > 0 && <span className="bf-count">{pills.length}</span>}
          </summary>
          <form action="/bills" method="get" className="glass-strong bf-panel">
            {q && <input type="hidden" name="q" value={q} />}
            {filter !== 'all' && <input type="hidden" name="f" value={filter} />}
            <Field label={t('filters.service')}>
              <Select
                name="sv"
                defaultValue={serviceId ? `s:${serviceId}` : typeSlug ? `t:${typeSlug}` : ''}
              >
                <option value="">{t('search.allServices')}</option>
                {serviceGroups.map((g) => {
                  const key = groupKey(g);
                  if (!key) {
                    const svc = g.services[0]!;
                    return (
                      <option key={svc.id} value={`s:${svc.id}`}>
                        {svc.name}
                      </option>
                    );
                  }
                  return (
                    <optgroup key={key} label={groupName(g)}>
                      <option value={`t:${key}`}>
                        {t('filters.everyIn', { name: groupName(g) })}
                      </option>
                      {g.services.map((svc) => (
                        <option key={svc.id} value={`s:${svc.id}`}>
                          {svc.name}
                        </option>
                      ))}
                    </optgroup>
                  );
                })}
              </Select>
            </Field>
            {years.length > 1 && (
              <Field label={t('filters.year')}>
                <Select name="y" defaultValue={year ?? ''}>
                  <option value="">{t('search.allYears')}</option>
                  {years.map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </Select>
              </Field>
            )}
            {hasPersonal && (
              <Field label={t('whoseFilter.label')}>
                <Select name="o" defaultValue={whose}>
                  {(['all', 'household', 'mine'] as const).map((o) => (
                    <option key={o} value={o}>
                      {t(`whoseFilter.${o}`)}
                    </option>
                  ))}
                </Select>
              </Field>
            )}
            <Field label={t('filters.when')}>
              <Select name="w" defaultValue={when}>
                {(['now', 'upcoming', 'all'] as const).map((w) => (
                  <option key={w} value={w}>
                    {t(`when.${w}`)}
                  </option>
                ))}
              </Select>
            </Field>
            <div className="bf-acts">
              <Button type="submit" size="sm">
                {t('filters.apply')}
              </Button>
              <Link
                href={href({ s: null, t: null, y: null, o: 'all', w: 'now' })}
                className="btn btn-plain btn-sm"
              >
                {t('filters.reset')}
              </Link>
            </div>
          </form>
        </details>
      </div>
      {(pills.length > 0 || (when === 'now' && later > 0)) && (
        <div className="bf-pills">
          {pills.map((p) => (
            <Link
              key={p.key}
              href={p.href}
              className="bf-pill"
              aria-label={t('filters.remove', { name: p.label })}
            >
              {p.label}
              <Icon name="x" width={12} height={12} />
            </Link>
          ))}
          {pills.length > 1 && (
            <Link
              href={href({ s: null, t: null, y: null, o: 'all', w: 'now' })}
              className="bf-clear"
            >
              {t('filters.clearAll')}
            </Link>
          )}
          {when === 'now' && later > 0 && (
            <Link href={href({ w: 'upcoming' })} className="bf-clear bf-later">
              <Icon name="calendar" width={13} height={13} />
              {t('upcoming', { count: later })}
            </Link>
          )}
        </div>
      )}
      {filtered && (
        <p className="muted small -mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
          {q
            ? t('searchResults', { count: items.length, q })
            : t('filterResults', { count: items.length })}
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

      {items.length === 0 ? (
        <EmptyCard
          icon="search"
          title={t('empty.noMatch')}
          body={
            when === 'now' && later > 0
              ? t('upcomingOnly', { count: later })
              : q
                ? t('searchResults', { count: 0, q })
                : t('filterResults', { count: 0 })
          }
        >
          {when === 'now' && later > 0 && (
            <LinkButton href={href({ w: 'upcoming' })} variant="primary" icon="calendar">
              {t('upcoming', { count: later })}
            </LinkButton>
          )}
          {filtered && (
            <LinkButton href="/bills" variant="secondary">
              {t('clearSearch')}
            </LinkButton>
          )}
        </EmptyCard>
      ) : (
        paged.items.map(([m, items]) => (
          <section key={m} className="d3-month">
            <div className="d3-month-h">
              <h2>
                <Highlight text={month(m, 'long')} tokens={tokens} />
              </h2>
              <span className="muted">
                {m.slice(0, 4)} · {t('summary.count', { count: items.length })} ·{' '}
                {money(
                  items.reduce((sum, e) => sum + (e.personal ? 0 : e.amountMinor), 0),
                  hh.currency,
                  { whole: true },
                )}
              </span>
            </div>
            <Card className="p-2">
              <Rows>
                {items.map((e) => (
                  <BillRow key={e.key} bill={e.row} />
                ))}
              </Rows>
            </Card>
          </section>
        ))
      )}
      <Pager
        page={paged.page}
        pages={paged.pages}
        href={(n) => href({ p: n })}
        labels={{
          nav: tp('nav'),
          previous: tp('previous'),
          next: tp('next'),
          page: (n) => tp('page', { n }),
        }}
      />
    </div>
  );
}
