import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { Icon } from '@/components/app/icons';
import { Badge, EmptyState, LinkButton, PageHeader } from '@/components/ui';
import { listBills, type BillListItem } from '@/lib/bills';
import { pageContext } from '@/lib/context';
import { darkVariant } from '@/lib/palette';
import { listServices } from '@/lib/services';

type Filter = 'all' | 'unpaid' | 'overdue' | 'unusual' | 'paid';
const FILTERS: Filter[] = ['all', 'unpaid', 'overdue', 'unusual', 'paid'];

export default async function BillsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; f?: string }>;
}) {
  const { q = '', f = 'all' } = await searchParams;
  const needle = q.trim().toLowerCase();
  const filter: Filter = (FILTERS as string[]).includes(f) ? (f as Filter) : 'all';
  const { hh, me, money, date, today } = await pageContext();
  const t = await getTranslations('bills');
  const all = listBills(hh.id);
  const hasServices = listServices(hh.id).length > 0;
  const isOverdue = (b: BillListItem) => !b.paidToProviderAt && b.dueDate < today;
  const bills = all.filter((b) => {
    if (
      needle &&
      ![
        b.service.name,
        b.service.provider,
        b.externalRef ?? '',
        b.notes ?? '',
        b.service.type.label,
      ].some((x) => x.toLowerCase().includes(needle))
    )
      return false;
    if (filter === 'unpaid') return !b.paidToProviderAt;
    if (filter === 'overdue') return isOverdue(b);
    if (filter === 'unusual') return b.isAnomaly;
    if (filter === 'paid') return !!b.paidToProviderAt;
    return true;
  });
  const monthKey = (b: BillListItem) => b.periodStart.slice(0, 7);
  const monthLabel = (m: string) =>
    new Intl.DateTimeFormat(hh.locale, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
      new Date(`${m}-01T00:00:00Z`),
    );
  const groups = new Map<string, BillListItem[]>();
  for (const b of bills) groups.set(monthKey(b), [...(groups.get(monthKey(b)) ?? []), b]);
  const total = bills.reduce((s, b) => s + b.amountMinor, 0);
  const unpaid = bills.filter((b) => !b.paidToProviderAt).reduce((s, b) => s + b.amountMinor, 0);
  const href = (nf: Filter) => `/bills?f=${nf}${needle ? `&q=${encodeURIComponent(q)}` : ''}`;

  return (
    <>
      <PageHeader
        title={t('title')}
        subtitle={
          bills.length
            ? `${t('summary.count', { count: bills.length })} · ${t('summary.total', { amount: money(total) })}${unpaid ? ` · ${t('summary.unpaid', { amount: money(unpaid) })}` : ''}`
            : undefined
        }
        action={
          <span className="flex items-center gap-2">
            {me.role === 'owner' && all.length > 0 && (
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
      <div className="mb-5 flex flex-wrap items-center gap-2">
        {FILTERS.map((nf) => (
          <Link
            key={nf}
            href={href(nf)}
            className={`rounded-full px-4 py-2 text-sm font-semibold transition ${filter === nf ? 'bg-accent text-accent-fg' : 'bg-surface-2 text-fg-muted hover:text-fg'}`}
          >
            {t(`filters.${nf}`)}
          </Link>
        ))}
        {needle && (
          <span className="ml-auto flex items-center gap-3 text-sm text-fg-muted">
            {t('searchResults', { count: bills.length, q })}
            <Link href="/bills" className="font-semibold text-accent">
              {t('clearSearch')}
            </Link>
          </span>
        )}
      </div>

      {all.length === 0 ? (
        <EmptyState
          title={t('empty.title')}
          body={hasServices ? t('empty.body') : t('empty.noServices')}
          action={
            <LinkButton href={hasServices ? '/bills/new' : '/services/new'}>
              {hasServices ? t('add') : t('empty.addService')}
            </LinkButton>
          }
        />
      ) : bills.length === 0 ? (
        <EmptyState
          title={t('empty.title')}
          body={t('searchResults', { count: 0, q: needle || t(`filters.${filter}`) })}
          action={
            <LinkButton href="/bills" variant="secondary">
              {t('clearSearch')}
            </LinkButton>
          }
        />
      ) : (
        [...groups.entries()].map(([m, items]) => (
          <section key={m} className="mb-6">
            <h2 className="mb-3 font-display text-lg font-semibold">{monthLabel(m)}</h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {items.map((b) => {
                const overdue = isOverdue(b);
                const swatch = `light-dark(${b.service.colour}, ${darkVariant(b.service.colour)})`;
                const sourceLabel =
                  b.extractor === 'review'
                    ? t('tile.source.review')
                    : b.source === 'manual'
                      ? t('tile.source.manual')
                      : t(`tile.source.${b.source}`, {
                          pct: Math.round((b.confidence ?? 0) * 100),
                        });
                const sharePct = b.shareCount
                  ? Math.round((b.paidShareCount / b.shareCount) * 100)
                  : null;
                return (
                  <Link
                    key={b.id}
                    href={`/bills/${b.id}`}
                    className={`glass lift flex flex-col gap-3 rounded-card p-5 text-fg ${overdue ? 'bg-danger-soft' : ''}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <span className="flex items-center gap-3">
                        <span
                          className="glow-disc size-11"
                          style={{ color: swatch, ['--glow' as string]: swatch }}
                        >
                          <Icon name={b.service.type.icon} width={20} height={20} />
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
                      <p className="font-display text-[32px] leading-none font-semibold tracking-tight tabular-nums">
                        {money(b.amountMinor, b.currency)}
                      </p>
                      <p className="mt-1.5 text-xs text-fg-muted">
                        {t('tile.period', {
                          start: date(b.periodStart, 'short'),
                          end: date(b.periodEnd, 'short'),
                        })}{' '}
                        · {t('due')} {date(b.dueDate, 'short')}
                      </p>
                    </div>
                    {hh.splitMode === 'shared' && sharePct !== null && (
                      <div>
                        <div className="h-1.5 rounded-full bg-surface-2">
                          <div
                            className="h-1.5 rounded-full bg-accent"
                            style={{ width: `${Math.max(sharePct, 3)}%` }}
                          />
                        </div>
                        <p className="mt-1 text-[11px] text-fg-muted">
                          {t('tile.sharesBar', { paid: b.paidShareCount, total: b.shareCount })}
                        </p>
                      </div>
                    )}
                    <div className="flex items-center justify-between rounded-2xl border border-border-strong bg-surface-2 px-3 py-2 text-xs">
                      <span className="flex items-center gap-2 text-fg-muted">
                        <span
                          className={`size-1.5 rounded-full ${b.sourceDocumentId ? 'bg-accent' : 'bg-fg-muted'}`}
                        />
                        {sourceLabel}
                      </span>
                      <span className="flex items-center gap-2">
                        {b.alertKind && <Badge tone="danger">{t(`alert.${b.alertKind}`)}</Badge>}
                        {b.isAnomaly && <Badge tone="warning">{t('anomaly')}</Badge>}
                        {b.externalRef && (
                          <span className="font-mono text-fg-muted">#{b.externalRef}</span>
                        )}
                      </span>
                    </div>
                  </Link>
                );
              })}
            </div>
          </section>
        ))
      )}
    </>
  );
}
