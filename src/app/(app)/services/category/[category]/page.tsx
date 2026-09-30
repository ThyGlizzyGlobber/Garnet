import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { rowCtx, statusLabel } from '@/components/app/bill-rows';
import { Icon } from '@/components/app/icons';
import { Card } from '@/components/ui';
import { PageTitle, SectionHead } from '@/components/ui/blocks';
import { Chip, StatusChip } from '@/components/ui/chip';
import { Disc } from '@/components/ui/colour';
import { BackLink } from '@/components/ui/controls';
import { InlineAction } from '@/components/ui/form';
import { categoryView } from '@/lib/asset-view';
import { billDue } from '@/lib/bill-status';
import { pageContext } from '@/lib/context';
import { hasHousemates } from '@/lib/members';
import { colourCss } from '@/lib/palette';
import { CATEGORY_ICONS, isGroupedCategory } from '@/lib/service-categories';
import { createAssetAction, deleteAssetAction, updateAssetAction } from '../../asset-actions';
import { AssetForm } from '../../asset-form';

/**
 * A main service that holds its types (Vehicles → Registration, Car
 * insurance…; Health → Health insurance, Ambulance cover): every vehicle or
 * policy, each with what its kinds of bills came to, where they're added and
 * changed; then the sub-services, each opening its bills under the vehicles.
 * Numbers from categoryView().
 */
export default async function CategoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ category: string }>;
  searchParams: Promise<{ filed?: string }>;
}) {
  const { category } = await params;
  if (!isGroupedCategory(category)) notFound();
  const { filed } = await searchParams;
  const ctx = await pageContext();
  const { hh, me, money } = ctx;
  const t = await getTranslations('assets');
  const ts = await getTranslations('services');
  const rc = rowCtx(ctx, await getTranslations('ui'));
  const view = categoryView(hh, me, category, ctx.today);
  const kind = view.kind;
  const housemates = hasHousemates(hh.id);
  const year = (minor: number) => money(minor, hh.currency, { whole: true });
  const filedCount = Number(filed) || 0;

  return (
    <div className="scr d3-services">
      <BackLink href="/services">{ts('title')}</BackLink>
      <PageTitle
        eyebrow={ts('title')}
        title={t(`main.${category}`)}
        lede={t(`${kind}.lede`, {
          count: view.assets.length,
          amount: year(view.yearMinor),
          waiting: view.waiting,
        })}
      />

      {filedCount > 0 && (
        <Card className="bg-accent-soft">
          <p className="small">{t(`${kind}.filed`, { count: filedCount })}</p>
        </Card>
      )}

      <SectionHead title={t(`${kind}.many`)} />
      <div className="asset-grid">
        {view.assets.map((c) => (
          <Card key={c.asset.id} className="asset-card" id={`a-${c.asset.id}`}>
            <div className="asset-h">
              <Disc
                icon={CATEGORY_ICONS[category]}
                colour={view.types[0]?.type.colour ?? '#2a78d6'}
              />
              <div className="min-w-0">
                <b className="asset-name">{c.asset.name}</b>
                <span className="muted small">
                  {[
                    c.asset.identifier && (
                      <span key="id" className="mono">
                        {c.asset.identifier}
                      </span>
                    ),
                    t('billCount', { count: c.bills }),
                    c.asset.ownerMemberId && t('yours'),
                  ]
                    .filter(Boolean)
                    .flatMap((x, i) => (i ? [' · ', x] : [x]))}
                </span>
              </div>
              <div className="asset-fig">
                <span className="fig fig-md">{year(c.yearMinor)}</span>
                <span className="muted small">{t('lastYear')}</span>
              </div>
            </div>
            {c.lines.length ? (
              <ul className="asset-lines">
                {c.lines.map((l) => {
                  const due = billDue(l.latest, ctx.today);
                  return (
                    <li key={l.type.slug}>
                      <Link
                        href={`/services/group/${l.type.slug}#a-${c.asset.id}`}
                        style={{ ['--svc' as string]: colourCss(l.type.colour) }}
                      >
                        <i aria-hidden="true" />
                        <span>{l.type.label}</span>
                        <span className="muted small">{money(due.amountMinor)}</span>
                        <StatusChip
                          status={{ label: statusLabel(rc, due.status), tone: due.status.tone }}
                        />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="muted small">{t(`${kind}.noBills`)}</p>
            )}
            {c.canEdit && (
              <details className="asset-edit">
                <summary>{t('edit')}</summary>
                <AssetForm
                  action={updateAssetAction}
                  kind={kind}
                  whose={housemates}
                  asset={{
                    id: c.asset.id,
                    name: c.asset.name,
                    identifier: c.asset.identifier,
                    mine: !!c.asset.ownerMemberId,
                  }}
                />
                <InlineAction
                  action={deleteAssetAction}
                  hidden={{ id: c.asset.id }}
                  label={t(`${kind}.remove`)}
                  variant="danger"
                  confirm={t(`${kind}.removeConfirm`, { name: c.asset.name })}
                />
              </details>
            )}
          </Card>
        ))}
        <Card className="asset-card asset-new">
          <SectionHead title={t(`${kind}.add`)} />
          {view.assets.length === 0 && <p className="muted small">{t(`${kind}.firstBody`)}</p>}
          <AssetForm action={createAssetAction} kind={kind} whose={housemates} />
        </Card>
      </div>

      {view.types.length > 0 && (
        <>
          <SectionHead title={t('subServices')} className="mt-2" />
          <div className="asset-subs">
            {view.types.map((l) => (
              <Link
                key={l.type.slug}
                href={`/services/group/${l.type.slug}`}
                className="glass asset-sub rounded-card"
                style={{ ['--svc' as string]: colourCss(l.type.colour) }}
              >
                <Disc icon={l.type.icon} colour={l.type.colour} />
                <span className="min-w-0">
                  <b>{l.type.label}</b>
                  <span className="muted small">
                    {t(`${kind}.subLine`, { count: l.assets, amount: year(l.yearMinor) })}
                  </span>
                </span>
                {l.waiting > 0 && (
                  <Chip tone="warn">{t(`${kind}.waitingChip`, { count: l.waiting })}</Chip>
                )}
                <Icon name="chevron-right" width={16} height={16} className="chev" />
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
