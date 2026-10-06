import { getTranslations } from 'next-intl/server';
import { Badge, Button, Card, Field, Input, LinkButton, Select } from '@/components/ui';
import { EmptyCard, PageTitle } from '@/components/ui/blocks';
import { CopyButton } from '@/components/ui/copy';
import { viewerIsDeveloper } from '@/lib/auth/session';
import { billsAddress } from '@/lib/bills-address';
import { pageContext } from '@/lib/context';
import { addMonths, fiscalYearBounds } from '@/lib/periods';
import { groupTypes } from '@/lib/service-categories';
import { listServiceTypes, listServices } from '@/lib/services';
import { defaultPeriods, servicesPage, type Lens, type TileSection } from '@/lib/services-view';
import { listUnits } from '@/lib/units';
import { createServiceTypeAction } from './actions';
import { Analytics } from './analytics';
import { ServicesArrange } from './arrange';
import { Tile } from './tile';

const LENSES: Lens[] = ['month', 'year', 'fy'];

/**
 * Services (SCOPE-services.md): the analytics tool at the left with its
 * three lenses (this month, the calendar year, the financial year), and a
 * tile per service for the lens in view, in the household's groups then My
 * Services. The lens and its periods live in the URL (?lens=year&m=2026-09
 * &y=2026&fy=2026). Numbers from servicesPage().
 */
export default async function ServicesPage({
  searchParams,
}: {
  searchParams: Promise<{ lens?: string; m?: string; y?: string; fy?: string }>;
}) {
  const q = await searchParams;
  const ctx = await pageContext();
  const { hh, me, money } = ctx;
  const t = await getTranslations('services');
  const tl = await getTranslations('services.lens');
  const lens: Lens = (LENSES as string[]).includes(q.lens ?? '') ? (q.lens as Lens) : 'month';
  const today = ctx.today;
  const base = defaultPeriods(today, hh.fiscalYearStartMonth);
  // Any month up to next month, any year or financial year that has begun.
  const periods = {
    month: /^\d{4}-\d{2}$/.test(q.m ?? '') && q.m! <= addMonths(base.month, 1) ? q.m! : base.month,
    year: /^\d{4}$/.test(q.y ?? '') && q.y! <= base.year ? q.y! : base.year,
    fy: /^\d{4}$/.test(q.fy ?? '') && q.fy! <= base.fy ? q.fy! : base.fy,
  };
  const href = (o: { lens?: Lens; month?: string; year?: string; fy?: string }) => {
    const p = new URLSearchParams();
    const l = o.lens ?? lens;
    const next = { ...periods, ...o };
    if (l !== 'month') p.set('lens', l);
    if (next.month !== base.month) p.set('m', next.month);
    if (next.year !== base.year) p.set('y', next.year);
    if (next.fy !== base.fy) p.set('fy', next.fy);
    const s = p.toString();
    return s ? `/services?${s}` : '/services';
  };
  const view = servicesPage(hh, me, today, lens, periods);
  const operator = await viewerIsDeveloper();
  const address = billsAddress(hh);
  const count = listServices(hh.id, { viewer: me.id }).length;
  const periodName =
    lens === 'month'
      ? ctx.month(periods.month, 'long')
      : lens === 'year'
        ? periods.year
        : fiscalYearBounds(`${periods.fy}-12-01`, hh.fiscalYearStartMonth).label;
  // The year lenses' tiles say "2026 so far"; a year gone by just its name.
  const tilePeriod =
    lens === 'month'
      ? periodName
      : view.figures[lens].next === null
        ? `${periodName} ${tl('soFar')}`
        : periodName;
  const total = (sec: TileSection) =>
    money(sec.totalMinor, hh.currency, { whole: sec.totalMinor >= 100_000 });
  const section = (sec: TileSection, title: string, key: string) => (
    <section key={key} className="sv-sec">
      <h2 className="sv-sec-h">
        <span>{title}</span>
        <em>
          {total(sec)}
          {lens === 'month' ? ` ${t('month.thisMonth').toLowerCase()}` : ` · ${tilePeriod}`}
        </em>
      </h2>
      <div className="sv-grid">
        {sec.tiles.map((tile) => (
          <Tile key={tile.key} tile={tile} lens={lens} period={tilePeriod} ctx={ctx} />
        ))}
      </div>
    </section>
  );

  return (
    <div className="scr sv-page">
      {count > 0 && (
        <aside className="sv-left">
          <Analytics view={view} ctx={ctx} href={href} />
        </aside>
      )}
      <div className="sv-right">
        <PageTitle
          title={t('title')}
          lede={count ? undefined : t('ledeEmpty')}
          right={
            <LinkButton href="/services/new" variant="secondary" size="sm" icon="plus">
              {t('add')}
            </LinkButton>
          }
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
          <>
            {/* Arrange: the groups and order, dragged (SCOPE-header.md H-D3). */}
            <ServicesArrange hh={hh} me={me} today={ctx.today} />
            {/* The household's groups, in their order (the Arrange card and the bar's panel show the same). */}
            {view.sections.map((sec, i) =>
              section(
                sec,
                sec.group?.name ??
                  (view.sections.length > 1 ? t('month.otherServices') : t('title')),
                sec.group?.id ?? `loose-${i}`,
              ),
            )}
            {/* My Services: the viewer's own groups, then their own in no group. */}
            {view.mine.map((sec, i) =>
              section(
                sec,
                sec.group
                  ? `${t('month.myServices')} · ${sec.group.name}`
                  : view.mine.length > 1
                    ? `${t('month.myServices')} · ${t('month.otherServices')}`
                    : t('month.myServices'),
                sec.group?.id ?? `mine-${i}`,
              ),
            )}
          </>
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
    </div>
  );
}
