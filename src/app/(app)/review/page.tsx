import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { Badge, Card, EmptyState, LinkButton, List, ListRow, PageHeader } from '@/components/ui';
import { InlineAction } from '@/components/ui/form';
import { pageContext } from '@/lib/context';
import { documentCounts, listDocuments } from '@/lib/review';
import { reprocessAllAction } from './actions';

export default async function ReviewPage({
  searchParams,
}: {
  searchParams: Promise<{ all?: string }>;
}) {
  const { hh, date, money } = await pageContext();
  const t = await getTranslations('review');
  const { all } = await searchParams;
  const showAll = all === '1';
  const docs = showAll ? listDocuments(hh.id) : listDocuments(hh.id, { status: 'needs_review' });
  const counts = documentCounts(hh.id);
  const tone = {
    needs_review: 'warning',
    extracted: 'success',
    ignored: 'neutral',
    unprocessed: 'accent',
  } as const;

  return (
    <>
      <PageHeader
        title={t('title')}
        subtitle={t('subtitle', {
          review: counts.needs_review,
          total: counts.needs_review + counts.extracted + counts.ignored + counts.unprocessed,
        })}
        action={
          <LinkButton href="/bills/upload" variant="secondary">
            {t('upload')}
          </LinkButton>
        }
      />
      <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
        <Link
          href="/review"
          className={`rounded-full px-3.5 py-1.5 font-medium ${!showAll ? 'bg-accent text-accent-fg' : 'bg-surface-2 text-fg-muted'}`}
        >
          {t('filter.review')}
        </Link>
        <Link
          href="/review?all=1"
          className={`rounded-full px-3.5 py-1.5 font-medium ${showAll ? 'bg-accent text-accent-fg' : 'bg-surface-2 text-fg-muted'}`}
        >
          {t('filter.all')}
        </Link>
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
          title={showAll ? t('empty.allTitle') : t('empty.title')}
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
