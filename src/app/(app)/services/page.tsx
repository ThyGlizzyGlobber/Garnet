import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { Icon } from '@/components/app/icons';
import { Badge, Button, Card, Field, Input, LinkButton, Select } from '@/components/ui';
import { EmptyCard, PageTitle } from '@/components/ui/blocks';
import { Disc } from '@/components/ui/colour';
import { Segmented } from '@/components/ui/controls';
import { CopyButton } from '@/components/ui/copy';
import { viewerIsOperator } from '@/lib/auth/session';
import { billsAddress } from '@/lib/bills-address';
import { pageContext } from '@/lib/context';
import { colourCss } from '@/lib/palette';
import { groupTypes } from '@/lib/service-categories';
import { listServiceTypes, listServices } from '@/lib/services';
import { servicesView, type RibbonGroup, type ServiceScope } from '@/lib/services-view';
import { listUnits } from '@/lib/units';
import { createServiceTypeAction } from './actions';
import { ribbonRenderer } from './ribbon';

const SCOPES: ServiceScope[] = ['all', 'household', 'mine'];

/**
 * Services as year ribbons: one line per service, one block per bill across
 * the last year, a thin line for today. Numbers from servicesView().
 */
export default async function ServicesPage({
  searchParams,
}: {
  searchParams: Promise<{ scope?: string }>;
}) {
  const { scope: requested } = await searchParams;
  const ctx = await pageContext();
  const { hh, me, money } = ctx;
  const t = await getTranslations('services');
  const hasMine = listServices(hh.id, { owner: me.id, includeInactive: true }).length > 0;
  const scope: ServiceScope =
    hasMine && (SCOPES as string[]).includes(requested ?? '') ? (requested as ServiceScope) : 'all';
  const view = servicesView(hh, me.id, ctx.today, scope);
  const operator = await viewerIsOperator();
  const address = billsAddress(hh);
  const count = view.services.length;

  const ribbon = await ribbonRenderer(ctx, view.window);

  // A main service with sub-services: a heading (its total and a link to its
  // page), then each sub-service's ribbon under it.
  const group = (g: RibbonGroup) =>
    g.typeSlug === null ? (
      ribbon(g.ribbons[0]!)
    ) : (
      <section
        key={`g-${g.typeSlug}`}
        className="d3-group"
        style={{ ['--svc' as string]: colourCss(g.colour) }}
      >
        <Link href={`/services/group/${g.typeSlug}`} className="d3-group-h">
          <Disc icon={g.icon} colour={g.colour} size="sm" />
          <b>{g.label}</b>
          <span className="muted small">
            {t('group.count', { count: g.ribbons.length })} ·{' '}
            {t('group.year', { amount: money(g.yearMinor, hh.currency, { whole: true }) })}
          </span>
          <Icon name="chevron-right" width={16} height={16} />
        </Link>
        {g.ribbons.map((r) => ribbon(r, { sub: true }))}
      </section>
    );

  const right = (
    <>
      {hasMine && (
        <Segmented
          small
          label={t('scope.label')}
          value={scope}
          items={SCOPES.map((v) => ({
            value: v,
            label: t(`scope.${v}`),
            href: v === 'all' ? '/services' : `/services?scope=${v}`,
          }))}
        />
      )}
      <LinkButton href="/services/new" variant="secondary" size="sm" icon="plus">
        {t('add')}
      </LinkButton>
    </>
  );

  return (
    <div className="scr d3-services">
      <PageTitle
        title={t('title')}
        lede={count ? t('lede', { count, household: hh.name }) : t('ledeEmpty')}
        right={right}
      />
      {count === 0 ? (
        <EmptyCard
          icon="services"
          title={t('empty.title')}
          body={t.rich('empty.bodyAddress', {
            address: () => <b className="mono">{address ?? '…'}</b>,
          })}
        >
          {address && (
            <CopyButton
              value={address}
              label={t('empty.copyAddress')}
              className="btn btn-primary"
            />
          )}
          <LinkButton href="/services/new" variant="secondary" icon="plus">
            {t('empty.add')}
          </LinkButton>
        </EmptyCard>
      ) : (
        view.groups.map(group)
      )}
      {operator && (
        <Card>
          <h2 className="font-display font-semibold">{t('types.title')}</h2>
          <p className="muted small mt-0.5">{t('types.body')}</p>
          <dl className="mt-3 flex flex-col gap-2">
            {groupTypes(listServiceTypes()).map((g) => (
              <div key={g.category} className="flex flex-wrap items-baseline gap-1.5">
                <dt className="muted small w-20 shrink-0 font-semibold">
                  {t(`categories.${g.category}`)}
                </dt>
                <dd className="flex flex-1 flex-wrap gap-1.5">
                  {g.types.map((ty) => (
                    <Badge key={ty.slug}>{ty.label}</Badge>
                  ))}
                </dd>
              </div>
            ))}
          </dl>
          <form action={createServiceTypeAction} className="mt-4 flex flex-wrap items-end gap-3">
            <Field label={t('types.label')}>
              <Input name="label" required placeholder={t('types.placeholder')} />
            </Field>
            <Field label={t('types.unit')}>
              <Select name="defaultUnit" defaultValue="">
                <option value="">—</option>
                {listUnits().map((u) => (
                  <option key={u.key} value={u.key}>
                    {u.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Button type="submit" variant="secondary">
              {t('types.add')}
            </Button>
          </form>
        </Card>
      )}
    </div>
  );
}
