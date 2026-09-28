import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { Badge, Card, EmptyState, LinkButton, List, ListRow, PageHeader } from '@/components/ui';
import { InlineAction } from '@/components/ui/form';
import { billsAddress } from '@/lib/bills-address';
import { pageContext } from '@/lib/context';
import { documentCounts, listDocuments } from '@/lib/review';
import { reprocessAllAction } from './actions';

type Filter = 'review' | 'bills' | 'receipts' | 'other' | 'all';
const FILTERS: Filter[] = ['review', 'bills', 'receipts', 'other', 'all'];

export default async function ReviewPage({
  searchParams,
}: {
  searchParams: Promise<{ all?: string; f?: string }>;
}) {
  const { hh, date, money } = await pageContext();
  const t = await getTranslations('review');
  const tb = await getTranslations('billsAddress');
  const address = billsAddress(hh);
  const { all, f } = await searchParams;
  const filter: Filter = (FILTERS as string[]).includes(f ?? '')
    ? (f as Filter)
    : all === '1'
      ? 'all'
      : 'review';
  const everything = listDocuments(hh.id);
  const docs = everything.filter((d) =>
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
  const counts = documentCounts(hh.id);
  const tone = {
    needs_review: 'warning',
    extracted: 'success',
    ignored: 'neutral',
    unprocessed: 'accent',
    notice: 'neutral',
  } as const;

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
      {address && (
        <p className="mb-4 text-sm text-fg-muted">
          {tb('short', { address: '' })}
          <Link href="/settings" className="font-mono text-xs text-accent">
            {address}
          </Link>
        </p>
      )}
      <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
        {FILTERS.map((key) => (
          <Link
            key={key}
            href={key === 'review' ? '/review' : `/review?f=${key}`}
            className={`rounded-full px-3.5 py-1.5 font-medium ${filter === key ? 'bg-accent text-accent-fg' : 'bg-surface-2 text-fg-muted'}`}
          >
            {t(`filter.${key}`)}
          </Link>
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
          title={filter === 'review' ? t('empty.title') : t('empty.allTitle')}
          body={t('empty.body')}
          action={<LinkButton href="/bills/upload">{t('upload')}</LinkButton>}
        />
      ) : (
        <List>
          {docs.map((d) => {
            const r = d.extraction?.result;
            return (
              <ListRow key={d.id} href={d.billId ? `/bills/${d.billId}` : `/review/${d.id}`}>
                <div className="min-w-0">
                  <p className="truncate font-semibold">
                    {r
                      ? `${r.bill.provider} · ${r.bill.serviceType}`
                      : (d.originalFilename ?? d.path)}
                  </p>
                  <p className="truncate text-xs text-fg-muted">
                    {t(`kind.${d.kind}`)} · {date(d.receivedAt, 'short')}
                    {d.emailSubject && ` · ${d.emailSubject}`}
                    {d.extraction?.reason && ` · ${d.extraction.reason}`}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Badge tone={tone[d.status]}>{t(`status.${d.status}`)}</Badge>
                  {r && (
                    <span className="font-semibold tabular-nums">
                      {money(r.bill.amountMinor, r.bill.currency)}
                    </span>
                  )}
                </div>
              </ListRow>
            );
          })}
        </List>
      )}
      <Card className="mt-6 text-xs text-fg-muted">{t('footnote')}</Card>
    </>
  );
}
