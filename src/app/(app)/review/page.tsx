import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { ForwardAddress } from '@/components/app/forward-address';
import { SearchBar } from '@/components/app/search-bar';
import {
  Badge,
  Card,
  Chip,
  EmptyState,
  LinkButton,
  List,
  ListRow,
  PageHeader,
} from '@/components/ui';
import { InlineAction } from '@/components/ui/form';
import { billsAddress } from '@/lib/bills-address';
import { pageContext } from '@/lib/context';
import {
  documentCounts,
  listDocuments,
  plainReason,
  searchDocuments,
  STATUS_TONE,
} from '@/lib/review';
import { Highlight } from '@/components/app/highlight';
import { groupByMonth } from '@/lib/bill-month';
import { reprocessAllAction } from './actions';

type Filter = 'review' | 'bills' | 'receipts' | 'other' | 'all';
const FILTERS: Filter[] = ['review', 'bills', 'receipts', 'other', 'all'];

export default async function ReviewPage({
  searchParams,
}: {
  searchParams: Promise<{ all?: string; f?: string; q?: string }>;
}) {
  const { hh, me, date, money, month } = await pageContext();
  const t = await getTranslations('review');
  const address = billsAddress(hh);
  const { all, f, q: rawQ } = await searchParams;
  const q = (rawQ ?? '').trim();
  const filter: Filter = (FILTERS as string[]).includes(f ?? '')
    ? (f as Filter)
    : all === '1'
      ? 'all'
      : 'review';
  const found = searchDocuments(listDocuments(hh.id, { viewer: me.id }), q, hh.locale);
  const tokens = found.tokens;
  const docs = found.docs.filter((d) =>
    filter === 'all'
      ? true
      : filter === 'review'
        ? d.status === 'needs_review'
        : filter === 'bills'
          ? d.category === 'bill'
          : filter === 'receipts'
            ? d.category === 'receipt'
            : d.category === 'other' && d.status !== 'needs_review',
  );
  const counts = documentCounts(hh.id, { viewer: me.id });
  // Grouped by the month each document belongs to (its bill's month, or the
  // date printed on it), not the day it arrived. listDocuments sorts newest first.
  const groups = groupByMonth(docs, (d) => d.date);
  const link = (key: Filter) => {
    const u = new URLSearchParams();
    if (key !== 'review') u.set('f', key);
    if (q) u.set('q', q);
    return u.size ? `/review?${u}` : '/review';
  };
  const tone = STATUS_TONE;

  return (
    <>
      <PageHeader
        title={t('title')}
        subtitle={t('subtitle', {
          review: counts.needs_review,
          total: Object.values(counts).reduce((x, y) => x + y, 0),
        })}
        action={
          <LinkButton href="/bills/upload" variant="secondary">
            {t('upload')}
          </LinkButton>
        }
      />
      {address && <ForwardAddress address={address} />}
      <div className="mb-3">
        <SearchBar
          action="/review"
          q={q}
          keep={{ f: filter !== 'review' ? filter : null }}
          placeholder={t('search.placeholder')}
          label={t('search.label')}
          submit={t('search.submit')}
        />
      </div>
      {q && (
        <p className="mb-3 flex flex-wrap gap-x-3 text-sm text-fg-muted">
          {t('search.results', { count: docs.length, q })}
          <Link href={link(filter)} className="font-semibold text-accent" prefetch={false}>
            {t('search.clear')}
          </Link>
        </p>
      )}
      <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
        {FILTERS.map((key) => (
          <Chip key={key} href={link(key)} active={filter === key}>
            {t(`filter.${key}`)}
          </Chip>
        ))}
        <span className="flex-1" />
        <InlineAction
          action={reprocessAllAction}
          label={t('reprocessAll')}
          variant="ghost"
          confirm={t('reprocessAllConfirm')}
        />
      </div>
      {docs.length === 0 ? (
        <EmptyState
          title={
            q
              ? t('search.results', { count: 0, q })
              : filter === 'review'
                ? t('empty.title')
                : t('empty.allTitle')
          }
          body={t('empty.body')}
          action={<LinkButton href="/bills/upload">{t('upload')}</LinkButton>}
        />
      ) : (
        groups.map(([m, items]) => (
          <section key={m} className="mb-6">
            <h2 className="mb-2 font-display text-lg font-semibold">
              <Highlight text={month(m, 'long-year')} tokens={tokens} />
            </h2>
            <List>
              {items.map((d) => {
                const r = d.extraction?.result;
                const arrivedLater = d.arrived.slice(0, 7) !== d.date.slice(0, 7);
                const why = plainReason(d.extraction);
                return (
                  // Anything that belongs with a bill opens that bill's one page.
                  <ListRow
                    key={d.id}
                    href={d.linkedBillId ? `/bills/${d.linkedBillId}` : `/review/${d.id}`}
                  >
                    <div className="min-w-0">
                      <p className="truncate font-semibold">
                        <Highlight
                          text={
                            r?.bill.provider
                              ? `${r.bill.provider} · ${r.bill.serviceType}`
                              : (d.emailSubject ?? d.originalFilename ?? d.path)
                          }
                          tokens={tokens}
                        />
                      </p>
                      <p className="truncate text-xs text-fg-muted">
                        {t(`kind.${d.kind}`)} · {date(d.date, 'short')}
                        {arrivedLater &&
                          ` · ${t('arrived', { date: date(d.receivedAt, 'short') })}`}
                        {why.kind !== 'none' && (
                          <>
                            {' · '}
                            <Highlight
                              text={why.kind === 'check' ? t('why.check') : why.text}
                              tokens={tokens}
                            />
                          </>
                        )}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <Badge tone={tone[d.status]}>
                        {d.category === 'receipt' ? t('category.receipt') : t(`status.${d.status}`)}
                      </Badge>
                      {r && r.bill.amountMinor > 0 && (
                        <span className="font-semibold tabular-nums">
                          <Highlight
                            text={money(r.bill.amountMinor, r.bill.currency)}
                            tokens={tokens}
                          />
                        </span>
                      )}
                    </div>
                  </ListRow>
                );
              })}
            </List>
          </section>
        ))
      )}
      <Card className="mt-6 text-xs text-fg-muted">{t('footnote')}</Card>
    </>
  );
}
