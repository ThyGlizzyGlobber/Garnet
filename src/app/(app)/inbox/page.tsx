import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { docRowFor, rowCtx } from '@/components/app/bill-rows';
import { Card, LinkButton } from '@/components/ui';
import { AddressCard, EmptyCard, PageTitle } from '@/components/ui/blocks';
import { Segmented, SearchField } from '@/components/ui/controls';
import { InlineAction } from '@/components/ui/form';
import { DocRow, Rows } from '@/components/ui/rows';
import { arrivalOf, fileView, memberNames } from '@/lib/bill-files';
import { billsAddress } from '@/lib/bills-address';
import { listBills } from '@/lib/bills';
import { pageContext } from '@/lib/context';
import { billDue } from '@/lib/bill-status';
import { groupByMonth } from '@/lib/bill-month';
import { listDocuments, searchDocuments } from '@/lib/review';
import { reprocessAllAction } from './actions';

type Filter = 'all' | 'confirm' | 'bills' | 'receipts' | 'other';
const FILTERS: Filter[] = ['all', 'confirm', 'bills', 'receipts', 'other'];

/**
 * The Inbox: every bill, receipt and email that reached the household,
 * analysed as it arrived, filed by the month each belongs to. A document
 * that belongs with a bill opens that bill's page.
 */
export default async function InboxPage({
  searchParams,
}: {
  searchParams: Promise<{ all?: string; f?: string; q?: string }>;
}) {
  const ctx = await pageContext();
  const { hh, me, money, month } = ctx;
  const t = await getTranslations('review');
  const tu = await getTranslations('ui');
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

  return (
    <div className="scr d3-inbox">
      <PageTitle
        title={t('title')}
        lede={t('lede')}
        right={
          <>
            <LinkButton href="/bills/upload" variant="secondary" size="sm" icon="upload">
              {t('upload')}
            </LinkButton>
            {waiting > 0 && (
              <InlineAction
                action={reprocessAllAction}
                label={t('reprocessAll')}
                variant="ghost"
                confirm={t('reprocessAllConfirm')}
              />
            )}
          </>
        }
      />
      {address && (
        <Card className="d3-addr">
          <AddressCard label={t('forwardTo')} address={address} />
        </Card>
      )}
      {fresh ? (
        <EmptyCard icon="inbox" title={t('empty.allTitle')} body={t('empty.fresh')} />
      ) : (
        <>
          <div className="filters">
            <Segmented
              small
              label={t('filter.label')}
              value={filter}
              items={FILTERS.map((key) => ({
                value: key,
                label:
                  key === 'confirm' && waiting
                    ? `${t(`filter.${key}`)} · ${waiting}`
                    : t(`filter.${key}`),
                href: link(key),
              }))}
            />
            <form action="/inbox" method="get" className="contents">
              {filter !== 'all' && <input type="hidden" name="f" value={filter} />}
              <SearchField
                small
                placeholder={t('search.placeholder')}
                label={t('search.label')}
                defaultValue={q}
                className="w-full sm:w-72"
              />
            </form>
            {q && (
              <span className="muted small">
                {t('search.results', { count: docs.length, q })}{' '}
                <Link href={link(filter)} className="font-semibold text-accent" prefetch={false}>
                  {t('search.clear')}
                </Link>
              </span>
            )}
          </div>
          {docs.length === 0 ? (
            <EmptyCard
              icon={filter === 'confirm' ? 'check' : 'inbox'}
              title={filter === 'confirm' ? t('empty.title') : t('empty.allTitle')}
              body={filter === 'confirm' ? t('empty.confirmBody') : t('empty.body')}
            />
          ) : (
            groups.map(([m, items]) => (
              <Card key={m} className="inbox-grp">
                <div className="grp-h">
                  <span>{month(m, 'long-year')}</span>
                  <span className="muted">{items.length}</span>
                </div>
                <Rows>
                  {items.map((d) => {
                    const b = d.linkedBillId ? bills.get(d.linkedBillId) : undefined;
                    return (
                      <DocRow
                        key={d.id}
                        doc={docRowFor(
                          d,
                          { ...rc, arrival: arrivalOf(hh.id, d, names), view: fileView(d) },
                          {
                            bill: b
                              ? {
                                  serviceName: b.service.name,
                                  amount: money(billDue(b, ctx.today).amountMinor, b.currency),
                                }
                              : null,
                            needsPlain: true,
                          },
                        )}
                      />
                    );
                  })}
                </Rows>
              </Card>
            ))
          )}
        </>
      )}
    </div>
  );
}
