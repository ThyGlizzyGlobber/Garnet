import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { Icon } from '@/components/app/icons';
import { Badge, EmptyState, LinkButton, PageHeader } from '@/components/ui';
import { listBills } from '@/lib/bills';
import { pageContext } from '@/lib/context';
import { darkVariant } from '@/lib/palette';
import { listServices } from '@/lib/services';

export default async function BillsPage() {
  const { hh, me, money, date, today } = await pageContext();
  const t = await getTranslations('bills');
  const bills = listBills();
  const hasServices = listServices().length > 0;

  return (
    <>
      <PageHeader
        title={t('title')}
        action={
          <span className="flex items-center gap-2">
            {me.role === 'owner' && bills.length > 0 && (
              <a
                href="/api/export?kind=bills"
                className="glass hidden items-center rounded-full px-4 py-2 text-sm font-semibold text-fg hover:bg-surface-2 sm:inline-flex"
              >
                {t('download')}
              </a>
            )}
            <LinkButton href="/bills/upload" variant="secondary">
              {t('tile.upload')}
            </LinkButton>
            {hasServices && <LinkButton href="/bills/new">{t('add')}</LinkButton>}
          </span>
        }
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
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {bills.map((b) => {
            const overdue = !b.paidToProviderAt && b.dueDate < today;
            const swatch = `light-dark(${b.service.colour}, ${darkVariant(b.service.colour)})`;
            const sourceLabel =
              b.extractor === 'review'
                ? t('tile.source.review')
                : b.source === 'manual'
                  ? t('tile.source.manual')
                  : t(`tile.source.${b.source}`, { pct: Math.round((b.confidence ?? 0) * 100) });
            return (
              <Link
                key={b.id}
                href={`/bills/${b.id}`}
                className="glass flex flex-col gap-3 rounded-card p-5 text-fg transition hover:bg-surface-2"
              >
                <div className="flex items-start justify-between gap-3">
                  <span className="flex items-center gap-3">
                    <span
                      className="grid size-10 place-items-center rounded-xl text-white"
                      style={{ background: swatch }}
                    >
                      <Icon name={b.service.type.icon} width={18} height={18} />
                    </span>
                    <span className="flex flex-col leading-tight">
                      <span className="font-display font-semibold">{b.service.name}</span>
                      <span className="text-xs text-fg-muted">{b.service.provider}</span>
                    </span>
                  </span>
                  {b.paidToProviderAt ? (
                    <Badge tone="success">{t('tile.paidProvider')}</Badge>
                  ) : overdue ? (
                    <Badge tone="danger">{t('tile.overdue')}</Badge>
                  ) : (
                    <Badge tone="warning">{t('tile.unpaid')}</Badge>
                  )}
                </div>
                <div>
                  <p className="font-display text-[30px] leading-none font-semibold tracking-tight tabular-nums">
                    {money(b.amountMinor, b.currency)}
                  </p>
                  <p className="mt-1 text-xs text-fg-muted">
                    {t('tile.period', {
                      start: date(b.periodStart, 'short'),
                      end: date(b.periodEnd, 'short'),
                    })}{' '}
                    · {t('due')} {date(b.dueDate, 'short')}
                  </p>
                </div>
                {/* Document strip, as on the mockup: where the bill came from and how confidently it was read. */}
                <div className="flex items-center justify-between rounded-2xl border border-border-strong bg-surface-2 px-3 py-2 text-xs">
                  <span className="flex items-center gap-2">
                    <span
                      className={`size-1.5 rounded-full ${b.sourceDocumentId ? 'bg-accent' : 'bg-fg-muted'}`}
                    />
                    <span className="text-fg-muted">{sourceLabel}</span>
                  </span>
                  <span className="flex items-center gap-2">
                    {b.isAnomaly && <Badge tone="warning">{t('anomaly')}</Badge>}
                    {hh.splitMode === 'shared' && b.shareCount > 0 && (
                      <span className="text-fg-muted">
                        {t('tile.shares', { paid: b.paidShareCount, total: b.shareCount })}
                      </span>
                    )}
                    {b.externalRef && (
                      <span className="font-mono text-fg-muted">#{b.externalRef}</span>
                    )}
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}
