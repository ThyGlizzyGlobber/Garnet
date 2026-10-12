import Link from 'next/link';
import type { ReactNode } from 'react';
import { getTranslations } from 'next-intl/server';
import { Icon } from '@/components/app/icons';
import { PopoverClose } from '@/components/app/popover-close';
import { rowCtx } from '@/components/app/bill-rows';
import { Button, Field, LinkButton, Select } from '@/components/ui';
import { EmptyCard, PageTitle } from '@/components/ui/blocks';
import { CopyButton } from '@/components/ui/copy';
import { Segmented, SearchField } from '@/components/ui/controls';
import {
  GroupLabel,
  ListRow,
  MonthSection,
  MoreRows,
  PaidText,
  StatusPill,
} from '@/components/ui/list-row';
import { Pager } from '@/components/ui/pager';
import { billsAddress } from '@/lib/bills-address';
import { listBills, type BillListItem } from '@/lib/bills';
import { billDue } from '@/lib/bill-status';
import { groupByMonth } from '@/lib/bill-month';
import { billEntry, filterBills, type BillEntry } from '@/lib/bill-search';
import { pageContext } from '@/lib/context';
import { expectedBills } from '@/lib/expected';
import { canExportHousehold } from '@/lib/export';
import { formatMoneyParts, formatPeriod } from '@/lib/format';
import { pageParam, paginateGroups } from '@/lib/paging';
import { addMonths } from '@/lib/periods';
import { perDayFallback } from '@/lib/projections';
import { isRecurring } from '@/lib/recurring';
import { listDocuments, searchDocuments } from '@/lib/review';
import { groupServices, listServices, type ServiceWithType } from '@/lib/services';

type Filter = 'all' | 'unpaid' | 'paid' | 'unusual' | 'overdue';
/** Household bills, my personal bills, or both. */
type Whose = 'all' | 'household' | 'mine';
/** Up to this month (the default), the months after it, or every month. */
type When = 'now' | 'upcoming' | 'all';
const FILTERS: Filter[] = ['all', 'unpaid', 'paid', 'unusual'];
/** About this many bills a page; a month is never split across pages. */
const BILLS_PER_PAGE = 30;
/** Older months show this many rows, then "Show all N bills". */
const SHOWN = 4;

/** One row in a month: a bill in, or a bill a service is expected to send. */
type Item =
  | { kind: 'bill'; key: string; date: string; e: BillEntry; personal: boolean }
  | {
      kind: 'expected';
      key: string;
      date: string;
      svc: ServiceWithType;
      amountMinor: number;
      periodStart: string;
      periodEnd: string;
      personal: boolean;
    };

/**
 * Bills (SCOPE-redesign-2.md §4), filed by the month each belongs to. Within
 * a month the rows are grouped by what to do: To pay first, then Expected
 * (the bills each service is due to send, by date), then Paid, dimmed. The
 * month column carries the month's total and its paid / still-to-come split,
 * or one All paid pill. Older months show four rows and "Show all N bills".
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
    /** One month only (Home's bar chart): YYYY-MM. */
    m?: string;
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
  const tr = await getTranslations('bills.rd');
  const tu = await getTranslations('ui');
  const tp = await getTranslations('ui.pager');
  const ta = await getTranslations('main');
  const rc = rowCtx(ctx, tu);
  const thisMonth = ctx.today.slice(0, 7);
  const onlyMonth = /^\d{4}-\d{2}$/.test(params.m ?? '') ? params.m! : null;
  // The household's bills and this member's own (nobody else's personal bills).
  const everything = listBills(hh.id, { viewer: me.id });
  const hasPersonal = everything.some((b) => b.ownerMemberId);
  const whose: Whose =
    hasPersonal && (params.o === 'mine' || params.o === 'household') ? params.o : 'all';
  const inWhose = (ownerMemberId: string | null) =>
    whose === 'mine' ? !!ownerMemberId : whose === 'household' ? !ownerMemberId : true;
  const all = everything.filter((b) => inWhose(b.ownerMemberId));
  const services = listServices(hh.id, { includeInactive: true, viewer: me.id }).filter((svc) =>
    all.some((b) => b.serviceId === svc.id),
  );
  const serviceId = services.some((svc) => svc.id === params.s) ? params.s! : null;
  // A main service's sub-services are one choice (Subscriptions); Vehicles and Health too (t=vehicle).
  const serviceGroups = groupServices(services);
  const groupKey = (g: (typeof serviceGroups)[number]) => g.typeSlug ?? g.category;
  const picked = serviceGroups.find((g) => groupKey(g) && groupKey(g) === params.t);
  const typeSlug = picked ? params.t! : null;
  const category = picked?.category ?? null;
  // One month (from Home's chart) shows that month whatever it is; otherwise up to this month.
  const when: When = onlyMonth
    ? 'all'
    : params.w === 'upcoming' || params.w === 'all'
      ? params.w
      : 'now';
  const years = [...new Set(all.map(billEntry).map((e) => e.date.slice(0, 4)))].sort().reverse();
  const year = years.includes(params.y ?? '') ? params.y! : null;
  const hasServices = listServices(hh.id, { viewer: me.id }).length > 0;
  const address = billsAddress(hh);
  const { entries } = filterBills(
    all,
    { q, status: filter, serviceId, year, when, typeSlug: category ? null : typeSlug, category },
    { locale: hh.locale, today: ctx.today },
  );

  // The bills each service is expected to send (SCOPE-redesign-2.md §4 Bills 1):
  // this month's (late ones included) and, when looking ahead, the next twelve months'.
  const expectedItems: Item[] = [];
  if (filter === 'all' && !q) {
    const until = when === 'now' ? thisMonth : addMonths(thisMonth, 12);
    for (const svc of listServices(hh.id, { viewer: me.id })) {
      if (!inWhose(svc.ownerMemberId)) continue;
      if (serviceId && svc.id !== serviceId) continue;
      if (typeSlug && (category ? svc.type.category !== category : svc.typeSlug !== typeSlug))
        continue;
      const own = everything.filter((b) => b.serviceId === svc.id);
      for (const e of expectedBills(svc, own, until, perDayFallback(hh.id, svc, ctx.today))) {
        const m = e.dueDate.slice(0, 7);
        if (when === 'now' ? m > thisMonth : when === 'upcoming' ? m <= thisMonth : false) continue;
        if (year && e.dueDate.slice(0, 4) !== year) continue;
        if (onlyMonth && m !== onlyMonth) continue;
        expectedItems.push({
          kind: 'expected',
          key: `x-${svc.id}-${e.dueDate}`,
          date: e.dueDate,
          svc,
          amountMinor: e.amountMinor,
          periodStart: e.periodStart,
          periodEnd: e.periodEnd,
          personal: !!svc.ownerMemberId,
        });
      }
    }
  }
  const items: Item[] = [
    ...entries
      .filter((e) => !onlyMonth || e.date.slice(0, 7) === onlyMonth)
      .map((e): Item => ({
        kind: 'bill',
        key: e.bill.id,
        date: e.date,
        e,
        personal: !!e.bill.ownerMemberId,
      })),
    ...expectedItems,
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
    m?: string | null;
    /** Any other change starts again at the first page. */
    p?: number;
  }) => {
    const next = {
      f: filter,
      s: serviceId,
      y: year,
      q,
      o: whose,
      w: when,
      t: typeSlug,
      m: onlyMonth,
      ...change,
    };
    const u = new URLSearchParams();
    if (next.o !== 'all') u.set('o', next.o);
    if (next.m) u.set('m', next.m);
    else if (next.w !== 'now') u.set('w', next.w);
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
    filter !== 'all' ||
    !!serviceId ||
    !!typeSlug ||
    !!year ||
    !!q ||
    whose !== 'all' ||
    !!onlyMonth;
  // What the Filters panel has set, as pills that each take one away.
  const pickedService = services.find((svc) => svc.id === serviceId);
  const groupName = (g: (typeof serviceGroups)[number]) =>
    g.category ? ta(`main.${g.category}`) : g.label;
  const pills = [
    onlyMonth ? { key: 'm', label: month(onlyMonth, 'long-year'), href: href({ m: null }) } : null,
    typeSlug && picked ? { key: 't', label: groupName(picked), href: href({ t: null }) } : null,
    pickedService ? { key: 's', label: pickedService.name, href: href({ s: null }) } : null,
    year ? { key: 'y', label: year, href: href({ y: null }) } : null,
    whose !== 'all'
      ? { key: 'o', label: t(`whoseFilter.${whose}`), href: href({ o: 'all' }) }
      : null,
    when !== 'now' && !onlyMonth
      ? { key: 'w', label: t(`when.${when}`), href: href({ w: 'now' }) }
      : null,
  ].filter((x): x is { key: string; label: string; href: string } => !!x);
  const inboxMatches = q
    ? searchDocuments(listDocuments(hh.id, { viewer: me.id }), q, hh.locale).docs.length
    : 0;
  const canExport = canExportHousehold(me, hh) ? everything.length > 0 : hasPersonal;
  const clearHref = href({ s: null, t: null, y: null, o: 'all', w: 'now', m: null });

  /** "Alinta Energy · covers 7 Sept – 6 Oct": the provider where it differs, then the period. */
  const subFor = (name: string, provider: string, start: string, end: string, extra: string[]) =>
    [
      provider && provider !== name ? provider : null,
      ...extra,
      tr('covers', { range: formatPeriod(start, end, hh.locale) }),
    ]
      .filter(Boolean)
      .join(' · ');
  const repeatMark = (
    svc: Pick<ServiceWithType, 'recurringSince' | 'isActive' | 'cancelledAt' | 'cadence' | 'id'>,
  ) =>
    isRecurring(svc) ? (
      <Icon
        name="repeat"
        width={16}
        height={16}
        className="rep"
        aria-label={tr('recurring')}
        role="img"
      />
    ) : undefined;

  const billRow = (it: Extract<Item, { kind: 'bill' }>) => {
    const b: BillListItem = it.e.bill;
    const due = billDue(b, ctx.today);
    const paid = !!it.e.paidAt;
    const extra: string[] = [];
    if (b.asset) extra.push(b.asset.name);
    if (due.instalment)
      extra.push(tr('instalment', { n: due.instalment.n, of: due.instalment.of }));
    const sub =
      subFor(b.service.name, b.service.provider, b.periodStart, b.periodEnd, extra) +
      (b.assumed && paid ? ` · ${tr('assumedPaid')}` : '');
    return (
      <ListRow
        key={it.key}
        href={`/bills/${b.id}`}
        icon={b.service.type.icon}
        name={b.service.name}
        mark={
          <>
            {!paid && repeatMark(b.service)}
            {b.isAnomaly && (
              <StatusPill tone="soon" icon={null}>
                {tr('unusual')}
              </StatusPill>
            )}
          </>
        }
        sub={sub}
        status={
          paid ? (
            <PaidText>{tr('paid')}</PaidText>
          ) : due.status.key === 'overdue' ? (
            <StatusPill tone="bad">
              {tu('status.overdue', {
                n: Math.abs(due.status.days),
                date: rc.dateYear(due.status.dueDate),
              })}
            </StatusPill>
          ) : (
            <StatusPill tone="soon">
              {tu('status.due', { date: rc.dateYear(due.status.dueDate) })}
            </StatusPill>
          )
        }
        amount={money(it.e.amountMinor, b.currency)}
        variant={paid ? 'paid' : undefined}
        ariaLabel={tr('openBill', { name: b.service.name })}
      />
    );
  };
  const expectedRow = (it: Extract<Item, { kind: 'expected' }>) => (
    <ListRow
      key={it.key}
      href={`/services/${it.svc.id}`}
      icon={it.svc.type.icon}
      name={it.svc.name}
      mark={repeatMark(it.svc)}
      sub={subFor(it.svc.name, it.svc.provider, it.periodStart, it.periodEnd, [])}
      status={
        <StatusPill tone="soon" icon={null}>
          {tr('expectedOn', { date: rc.dateYear(it.date) })}
        </StatusPill>
      }
      amount={money(it.amountMinor)}
      ariaLabel={tr('openService', { name: it.svc.name })}
    />
  );

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
    <div className="scr">
      <PageTitle
        title={t('title')}
        lede={t('lede')}
        right={
          canExport && (
            <a
              href="/api/export?kind=zip"
              download
              className="btn btn-glass"
              title={t(canExportHousehold(me, hh) ? 'downloadHint' : 'downloadMineHint')}
              aria-label={t(canExportHousehold(me, hh) ? 'download' : 'downloadMine')}
            >
              <Icon name="download" width={18} height={18} />
              <span>{t(canExportHousehold(me, hh) ? 'download' : 'downloadMine')}</span>
            </a>
          )
        }
      />
      {/* One bar: search, what to show, and the rest behind Filters. */}
      <div className="bf-bar">
        <form action="/bills" method="get" className="bf-search">
          {whose !== 'all' && <input type="hidden" name="o" value={whose} />}
          {filter !== 'all' && <input type="hidden" name="f" value={filter} />}
          {when !== 'now' && !onlyMonth && <input type="hidden" name="w" value={when} />}
          {onlyMonth && <input type="hidden" name="m" value={onlyMonth} />}
          {typeSlug && <input type="hidden" name="t" value={typeSlug} />}
          {serviceId && <input type="hidden" name="s" value={serviceId} />}
          {year && <input type="hidden" name="y" value={year} />}
          <SearchField
            autoFocus={!!raw.find}
            placeholder={t('search.placeholder')}
            label={t('search.label')}
            defaultValue={q}
            className="w-full"
          />
        </form>
        <Segmented
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
          <summary className={`btn btn-glass${pills.length ? ' is-on' : ''}`}>
            <Icon name="sliders" width={18} height={18} />
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
              <Select name="w" defaultValue={onlyMonth ? 'now' : when}>
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
              <Link href={clearHref} className="btn btn-plain btn-sm">
                {t('filters.reset')}
              </Link>
            </div>
          </form>
        </details>
      </div>
      {pills.length > 0 && (
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
            <Link href={clearHref} className="bf-clear">
              {t('filters.clearAll')}
            </Link>
          )}
        </div>
      )}
      {filtered && (
        <p className="rd-note">
          {q
            ? t('searchResults', { count: items.length, q })
            : t('filterResults', { count: items.length })}
          <Link href="/bills" className="tlink">
            {t('clearSearch')}
          </Link>
          {inboxMatches > 0 && (
            <Link href={`/inbox?f=all&q=${encodeURIComponent(q)}`} className="tlink">
              {t('search.inInbox', { count: inboxMatches })}
            </Link>
          )}
        </p>
      )}

      {items.length === 0 ? (
        <EmptyCard
          icon="search"
          title={t('empty.noMatch')}
          body={q ? t('searchResults', { count: 0, q }) : t('filterResults', { count: 0 })}
        >
          {filtered && (
            <LinkButton href="/bills" variant="secondary">
              {t('clearSearch')}
            </LinkButton>
          )}
        </EmptyCard>
      ) : (
        paged.items.map(([m, monthItems]) => {
          const bills = monthItems.filter(
            (x): x is Extract<Item, { kind: 'bill' }> => x.kind === 'bill',
          );
          const expected = monthItems.filter(
            (x): x is Extract<Item, { kind: 'expected' }> => x.kind === 'expected',
          );
          const toPay = bills
            .filter((x) => !x.e.paidAt)
            .sort((a, b) => a.e.dueDate.localeCompare(b.e.dueDate));
          const paid = bills
            .filter((x) => !!x.e.paidAt)
            .sort((a, b) => b.e.dueDate.localeCompare(a.e.dueDate));
          expected.sort((a, b) => a.date.localeCompare(b.date));
          // The month's figures count everything listed: the household's bills and the viewer's own.
          const sum = (xs: Item[]) =>
            xs.reduce((s, x) => s + (x.kind === 'bill' ? x.e.amountMinor : x.amountMinor), 0);
          const total = sum(monthItems);
          const paidMinor = sum(paid);
          const allPaid = toPay.length === 0 && expected.length === 0 && paid.length > 0;
          const fig = formatMoneyParts(total, hh.currency, hh.locale);
          // The rows in action order, with a label over each run.
          const rows: ReactNode[] = [];
          if (toPay.length) {
            rows.push(
              <GroupLabel
                key="l-pay"
                tone={
                  toPay.some((x) => billDue(x.e.bill, ctx.today).status.key === 'overdue')
                    ? 'bad'
                    : 'soon'
                }
                count={toPay.length}
              >
                {tr('toPay')}
              </GroupLabel>,
            );
            rows.push(...toPay.map(billRow));
          }
          if (expected.length) {
            rows.push(
              <GroupLabel key="l-exp" count={expected.length}>
                {tr('expected')}
              </GroupLabel>,
            );
            rows.push(...expected.map(expectedRow));
          }
          if (paid.length) {
            // A fully paid month says Paid once, in the column: no label needed on the rows.
            if (toPay.length || expected.length)
              rows.push(
                <GroupLabel key="l-paid" tone="ok" count={paid.length}>
                  {tr('paid')}
                </GroupLabel>,
              );
            rows.push(...paid.map(billRow));
          }
          const current = m === thisMonth || !!onlyMonth;
          const rowItems = rows.filter(
            (r) => !(typeof r === 'object' && r && 'key' in r && String(r.key).startsWith('l-')),
          );
          return (
            <MonthSection
              key={m}
              id={`bills-${m}`}
              month={month(m, 'long')}
              sub={`${m.slice(0, 4)} · ${t('summary.count', { count: monthItems.length })}`}
              figure={fig}
              below={
                allPaid ? (
                  <div className="msec-pill">
                    <StatusPill tone="ok">{tr('allPaid')}</StatusPill>
                  </div>
                ) : (
                  <div className="msec-split">
                    <div>
                      <span>{tr('paid')}</span>
                      <span>{money(paidMinor)}</span>
                    </div>
                    <div>
                      <span>{tr('stillToCome')}</span>
                      <span>{money(total - paidMinor)}</span>
                    </div>
                  </div>
                )
              }
            >
              {current || rowItems.length <= SHOWN ? (
                <>
                  {rows}
                  <div className="msec-end" />
                </>
              ) : (
                <MoreRows
                  shown={rows.slice(0, cutAt(rows, SHOWN))}
                  rest={rows.slice(cutAt(rows, SHOWN))}
                  label={tr('showAll', { count: monthItems.length })}
                />
              )}
            </MonthSection>
          );
        })
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

/** The index in `rows` after the first `n` rows that aren't group labels. */
function cutAt(rows: ReactNode[], n: number): number {
  let seen = 0;
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const label = typeof r === 'object' && r && 'key' in r && String(r.key).startsWith('l-');
    if (!label) seen++;
    if (seen === n) return i + 1;
  }
  return rows.length;
}
