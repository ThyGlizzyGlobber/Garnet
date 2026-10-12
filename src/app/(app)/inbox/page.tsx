import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { docRowFor, lowerFirst, rowCtx } from '@/components/app/bill-rows';
import { Icon } from '@/components/app/icons';
import { LinkButton } from '@/components/ui';
import { EmptyCard, PageTitle } from '@/components/ui/blocks';
import { Segmented, SearchField } from '@/components/ui/controls';
import { CopyButton } from '@/components/ui/copy';
import { InlineAction } from '@/components/ui/form';
import { ListRow, MonthSection, MoreRows, StatusPill } from '@/components/ui/list-row';
import { arrivalOf, fileView, memberNames } from '@/lib/bill-files';
import { billsAddress } from '@/lib/bills-address';
import { listBills } from '@/lib/bills';
import { billDue } from '@/lib/bill-status';
import { groupByMonth } from '@/lib/bill-month';
import { pageContext } from '@/lib/context';
import { listDocuments, searchDocuments } from '@/lib/review';
import { reprocessAllAction } from './actions';

type Filter = 'all' | 'confirm' | 'bills' | 'receipts' | 'other';
const FILTERS: Filter[] = ['all', 'confirm', 'bills', 'receipts', 'other'];
/** The first rows of a month; the rest behind "Show N more". */
const SHOWN = 5;

/**
 * The Inbox (SCOPE-redesign-2.md §4): the forwarding address as the hero,
 * the filter and search, and every document that reached the household by
 * month, the outcome on the right (the amount and where it was filed) rather
 * than a badge on every row. A document that belongs with a bill opens that
 * bill's page.
 */
export default async function InboxPage({
  searchParams,
}: {
  searchParams: Promise<{ all?: string; f?: string; q?: string }>;
}) {
  const ctx = await pageContext();
  const { hh, me, money, month } = ctx;
  const t = await getTranslations('review');
  const tr = await getTranslations('review.rd');
  const tu = await getTranslations('ui');
  const tc = await getTranslations('common');
  const rc = rowCtx(ctx, tu);
  const address = billsAddress(hh);
  const { f, q: rawQ } = await searchParams;
  const q = (rawQ ?? '').trim();
  // Older links say f=review for what is now "To confirm".
  const filter: Filter = (FILTERS as string[]).includes(f ?? '')
    ? (f as Filter)
    : f === 'review'
      ? 'confirm'
      : 'all';
  const found = searchDocuments(listDocuments(hh.id, { viewer: me.id }), q, hh.locale);
  const docs = found.docs.filter((d) =>
    filter === 'all'
      ? true
      : filter === 'confirm'
        ? d.status === 'needs_review' || d.status === 'unprocessed'
        : filter === 'bills'
          ? d.category === 'bill'
          : filter === 'receipts'
            ? d.category === 'receipt'
            : d.category === 'other' && d.status !== 'needs_review',
  );
  const waiting = found.docs.filter(
    (d) => d.status === 'needs_review' || d.status === 'unprocessed',
  ).length;
  const groups = groupByMonth(docs, (d) => d.date);
  const names = memberNames(hh.id);
  const bills = new Map(listBills(hh.id, { viewer: me.id }).map((b) => [b.id, b]));
  const link = (key: Filter) => {
    const u = new URLSearchParams();
    if (key !== 'all') u.set('f', key);
    if (q) u.set('q', q);
    return u.size ? `/inbox?${u}` : '/inbox';
  };
  const fresh = found.docs.length === 0 && !q;

  const rowFor = (d: (typeof docs)[number]) => {
    const b = d.linkedBillId ? bills.get(d.linkedBillId) : undefined;
    const view = fileView(d);
    const r = docRowFor(
      d,
      { ...rc, arrival: arrivalOf(hh.id, d, names), view },
      { needsPlain: true },
    );
    // "Bill · forwarded by Norm Smith · 7 Oct": the kind, how it arrived, the date.
    const [kind, how, when] = r.sub.split(' · ');
    const sub = [kind, how && lowerFirst(how), when].filter(Boolean).join(' · ');
    const end = b
      ? {
          a: money(billDue(b, ctx.today).amountMinor, b.currency),
          l: tr('filedTo', { service: b.service.name }),
        }
      : r.needs
        ? { a: <StatusPill tone="soon">{r.needs}</StatusPill> }
        : null;
    return (
      <ListRow
        key={d.id}
        href={r.href}
        icon={r.type === 'email' ? 'mail' : 'file'}
        name={r.title}
        sub={sub}
        end={end}
        wideStat
        ariaLabel={tr('open', { title: r.title })}
      />
    );
  };

  return (
    <div className="scr">
      <PageTitle
        title={t('title')}
        lede={t('lede')}
        right={
          <LinkButton href="/bills/upload" variant="secondary" icon="upload">
            {t('upload')}
          </LinkButton>
        }
      />
      {/* The hero: the forwarding address, with Copy. */}
      {address && (
        <section className="rd-card rd-pad ib-hero" aria-label={t('forwardTo')}>
          <div className="ib-hero-l">
            <span className="ib-hero-ic">
              <Icon name="mail" width={28} height={28} />
            </span>
            <div className="min-w-0">
              <p className="ib-hero-k">{t('forwardTo')}</p>
              <p className="ib-hero-a">{address}</p>
            </div>
          </div>
          <CopyButton
            value={address}
            label={tr('copyAddress')}
            className="btn btn-primary ib-copy"
          />
        </section>
      )}
      {fresh ? (
        <EmptyCard icon="inbox" title={t('empty.allTitle')} body={t('empty.fresh')} />
      ) : (
        <>
          <div className="ib-bar">
            <Segmented
              label={t('filter.label')}
              value={filter}
              items={FILTERS.map((key) => ({
                value: key,
                label: t(`filter.${key}`),
                href: link(key),
              }))}
            />
            <form action="/inbox" method="get" className="ib-search">
              {filter !== 'all' && <input type="hidden" name="f" value={filter} />}
              <SearchField
                placeholder={t('search.placeholder')}
                label={t('search.label')}
                defaultValue={q}
                className="w-full"
              />
            </form>
            <span className="ib-spacer" />
            {/* The positive zero-state: nothing to confirm; otherwise how many, in amber. */}
            {waiting === 0 ? (
              <StatusPill tone="ok">{tr('nothingToConfirm')}</StatusPill>
            ) : (
              <Link href={link('confirm')} className="spill soon">
                <Icon name="clock" width={14} height={14} />
                <span>{tr('toConfirm', { count: waiting })}</span>
              </Link>
            )}
          </div>
          {q && (
            <p className="rd-note">
              {t('search.results', { count: docs.length, q })}{' '}
              <Link href={link(filter)} className="tlink" prefetch={false}>
                {t('search.clear')}
              </Link>
            </p>
          )}
          {filter === 'confirm' && waiting > 0 && (
            <div className="ib-reprocess">
              <InlineAction
                action={reprocessAllAction}
                label={t('reprocessAll')}
                variant="ghost"
                confirm={t('reprocessAllConfirm')}
              />
            </div>
          )}
          {docs.length === 0 ? (
            <EmptyCard
              icon={filter === 'confirm' ? 'check' : 'inbox'}
              title={filter === 'confirm' ? t('empty.title') : t('empty.allTitle')}
              body={filter === 'confirm' ? t('empty.confirmBody') : t('empty.body')}
            />
          ) : (
            groups.map(([m, items]) => (
              <MonthSection
                key={m}
                id={`ib-${m}`}
                month={month(m, 'long')}
                sub={`${m.slice(0, 4)} · ${tr('items', { count: items.length })}`}
              >
                <MoreRows
                  shown={items.slice(0, SHOWN).map(rowFor)}
                  rest={items.slice(SHOWN).map(rowFor)}
                  label={tr('showMore', { count: Math.max(0, items.length - SHOWN) })}
                />
              </MonthSection>
            ))
          )}
          <p className="sr-only">{tc('more')}</p>
        </>
      )}
    </div>
  );
}
