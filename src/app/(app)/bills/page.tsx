import { getTranslations } from 'next-intl/server';
import { Badge, EmptyState, LinkButton, List, ListRow, PageHeader } from '@/components/ui';
import { listBills } from '@/lib/bills';
import { pageContext } from '@/lib/context';
import { listServices } from '@/lib/services';

export default async function BillsPage() {
  const { hh, money, date, today } = await pageContext();
  const t = await getTranslations('bills');
  const bills = listBills();
  const hasServices = listServices().length > 0;
  return (
    <>
      <PageHeader
        title={t('title')}
        action={hasServices ? <LinkButton href="/bills/new">{t('add')}</LinkButton> : undefined}
      />
      {bills.length === 0 ? (
        <EmptyState
          title={t('empty.title')}
          body={hasServices ? t('empty.body') : t('empty.noServices')}
          action={
            <LinkButton href={hasServices ? '/bills/new' : '/services/new'}>
              {hasServices ? t('add') : t('empty.addService')}
            </LinkButton>
          }
        />
      ) : (
        <List>
          {bills.map((b) => {
            const overdue = !b.paidToProviderAt && b.dueDate < today;
            const allPaid = b.shareCount > 0 && b.paidShareCount === b.shareCount;
            return (
              <ListRow key={b.id} href={`/bills/${b.id}`}>
                <div className="min-w-0">
                  <p className="truncate font-semibold">
                    {b.service.name}{' '}
                    <span className="font-normal text-fg-muted">· {b.service.provider}</span>
                  </p>
                  <p className="text-xs text-fg-muted">
                    {date(b.periodStart, 'short')} – {date(b.periodEnd, 'short')} · {t('due')}{' '}
                    {date(b.dueDate, 'short')}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {hh.splitMode === 'shared' && b.shareCount > 0 && (
                    <Badge tone={allPaid ? 'success' : 'warning'}>
                      {t('sharesPaid', { paid: b.paidShareCount, total: b.shareCount })}
                    </Badge>
                  )}
                  {b.isAnomaly && <Badge tone="warning">{t('anomaly')}</Badge>}
                  {overdue && <Badge tone="danger">{t('overdue')}</Badge>}
                  <span className="font-semibold tabular-nums">
                    {money(b.amountMinor, b.currency)}
                  </span>
                </div>
              </ListRow>
            );
          })}
        </List>
      )}
    </>
  );
}
