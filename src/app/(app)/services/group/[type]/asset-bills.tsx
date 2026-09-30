import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { billRowFor, rowCtx, statusLabel } from '@/components/app/bill-rows';
import { Icon } from '@/components/app/icons';
import { LinkButton } from '@/components/ui';
import { EmptyCard, PageTitle, SectionHead } from '@/components/ui/blocks';
import { Chip, StatusChip } from '@/components/ui/chip';
import { Disc } from '@/components/ui/colour';
import { BackLink } from '@/components/ui/controls';
import { BillRow, Rows } from '@/components/ui/rows';
import type { SubServiceView } from '@/lib/asset-view';
import { billDue } from '@/lib/bill-status';
import type { PageContext } from '@/lib/context';
import { colourCss } from '@/lib/palette';
import { CATEGORY_ICONS } from '@/lib/service-categories';
import { fileBillAction } from '../../asset-actions';
import { FileBillForm } from '../../asset-form';

/**
 * A sub-service of Vehicles or Health (Registration): one row per vehicle
 * (or policy) that has a bill of this kind, its latest bill and the last
 * twelve months on the row; opening it shows its bills underneath. Bills not
 * filed under one yet wait in their own row, each with "Which vehicle?".
 */
export async function AssetBillsPage({ ctx, view }: { ctx: PageContext; view: SubServiceView }) {
  const { hh, money } = ctx;
  const t = await getTranslations('assets');
  const rc = rowCtx(ctx, await getTranslations('ui'));
  const { type, kind, category } = view;
  const year = (minor: number) => money(minor, hh.currency, { whole: true });
  const here = `/services/group/${type.slug}`;
  const rows = (bills: SubServiceView['waiting']) =>
    bills.map((b) => (
      <BillRow
        key={b.id}
        bill={billRowFor(b, rc, { inService: true, share: true, noDisc: true, noAsset: true })}
      />
    ));

  return (
    <div className="scr d3-services">
      <BackLink href={`/services/category/${category}`}>{t(`main.${category}`)}</BackLink>
      <PageTitle
        eyebrow={t(`main.${category}`)}
        title={type.label}
        lede={t(`${kind}.subLede`, {
          count: view.groups.length,
          amount: year(view.yearMinor),
          waiting: view.waiting.length,
        })}
        right={
          <LinkButton
            href={`/services/category/${category}`}
            variant="secondary"
            size="sm"
            icon="plus"
          >
            {t(`${kind}.add`)}
          </LinkButton>
        }
      />

      {view.groups.length === 0 && view.waiting.length === 0 ? (
        <EmptyCard
          icon={type.icon}
          title={t('emptyTitle', { type: type.label })}
          body={t(`${kind}.emptyBody`)}
        />
      ) : null}

      {view.groups.map((g) => {
        const latest = g.bills[0]!;
        const due = billDue(latest, ctx.today);
        return (
          <details
            key={g.asset.id}
            id={`a-${g.asset.id}`}
            className="glass asset-g rounded-card"
            style={{ ['--svc' as string]: colourCss(type.colour) }}
          >
            <summary>
              <Disc icon={CATEGORY_ICONS[category]} colour={type.colour} />
              <span className="asset-g-t">
                <b>{g.asset.name}</b>
                <span className="muted small">
                  {g.asset.identifier && <span className="mono">{g.asset.identifier}</span>}
                  {g.asset.identifier ? ' · ' : ''}
                  {t('billCount', { count: g.bills.length })}
                  {g.asset.ownerMemberId ? ` · ${t('yours')}` : ''}
                </span>
              </span>
              <span className="asset-g-f">
                <span className="fig">{money(due.amountMinor, latest.currency)}</span>
                <StatusChip
                  status={{ label: statusLabel(rc, due.status), tone: due.status.tone }}
                />
              </span>
              <span className="asset-g-y muted small">
                {t('yearShort', { amount: year(g.yearMinor) })}
              </span>
              <Icon name="chevron-down" width={18} height={18} className="asset-g-chev" />
            </summary>
            <Rows className="asset-g-rows">{rows(g.bills)}</Rows>
          </details>
        );
      })}

      {view.waiting.length > 0 && (
        <details className="glass asset-g asset-waiting rounded-card" open>
          <summary>
            <span className="asset-g-ic">
              <Icon name="alert" width={18} height={18} />
            </span>
            <span className="asset-g-t">
              <b>{t(`${kind}.none`)}</b>
              <span className="muted small">
                {view.assets.length ? t(`${kind}.noneBody`) : t(`${kind}.noneBodyEmpty`)}
              </span>
            </span>
            <Chip tone="warn">{t('billCount', { count: view.waiting.length })}</Chip>
            <Icon name="chevron-down" width={18} height={18} className="asset-g-chev" />
          </summary>
          <div className="asset-g-rows">
            {view.waiting.map((b) => (
              <div key={b.id} className="asset-wait">
                <Rows>
                  <BillRow
                    bill={billRowFor(b, rc, { inService: true, share: true, noDisc: true })}
                  />
                </Rows>
                {view.assets.length > 0 && (
                  <FileBillForm
                    action={fileBillAction}
                    billId={b.id}
                    kind={kind}
                    assets={view.assets.map((a) => ({
                      id: a.id,
                      name: a.ownerMemberId ? `${a.name} · ${t('yours')}` : a.name,
                    }))}
                    back={here}
                  />
                )}
              </div>
            ))}
            {view.assets.length === 0 && (
              <div className="p-3">
                <LinkButton href={`/services/category/${category}`} variant="secondary" icon="plus">
                  {t(`${kind}.add`)}
                </LinkButton>
              </div>
            )}
          </div>
        </details>
      )}

      {view.services.length > 0 && (
        <>
          <SectionHead title={t('settings')} className="mt-2" />
          <p className="muted small">{t('settingsBody')}</p>
          <div className="flex flex-wrap gap-2">
            {view.services.map((s) => (
              <Link key={s.id} href={`/services/${s.id}`} className="btn btn-glass btn-sm">
                {s.name}
                {s.provider && s.provider !== s.name ? ` · ${s.provider}` : ''}
                {s.ownerMemberId ? ` · ${t('yours')}` : ''}
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
