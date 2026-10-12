import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { Icon } from '@/components/app/icons';
import { Badge, Button, Card, Field, Input, LinkButton, Select } from '@/components/ui';
import { EmptyCard, PageTitle } from '@/components/ui/blocks';
import { CopyButton } from '@/components/ui/copy';
import { Later, ListRow, RowCard, StatusPill } from '@/components/ui/list-row';
import { viewerIsDeveloper } from '@/lib/auth/session';
import { billsAddress } from '@/lib/bills-address';
import { pageContext } from '@/lib/context';
import { formatMoneyParts } from '@/lib/format';
import { groupTypes } from '@/lib/service-categories';
import { listServiceTypes, listServices } from '@/lib/services';
import { servicesPage, type ServiceTile, type TileText } from '@/lib/services-view';
import { listUnits } from '@/lib/units';
import { unitLabel } from '@/lib/units';
import { createServiceTypeAction } from './actions';
import { ServicesArrange } from './arrange';

/**
 * Services (SCOPE-redesign-2.md §4): one summary card for the month (paid so
 * far, bills paid, bills expected, a link to Budget), then one row per
 * service or main service inside grouped cards: Essentials and Other
 * services, or the household's own groups when admins have made some, each
 * with its month subtotal in the heading, then My Services. Rows with
 * nothing due are quiet. Numbers from servicesPage()'s month lens.
 */
export default async function ServicesPage({
  searchParams,
}: {
  searchParams: Promise<{ arrange?: string }>;
}) {
  const q = await searchParams;
  const ctx = await pageContext();
  const { hh, me, money, month, pct, qty } = ctx;
  const t = await getTranslations('services');
  const tr = await getTranslations('services.rd');
  const tu = await getTranslations('ui');
  const tm = await getTranslations('main');
  const today = ctx.today;
  const arranging = q.arrange === '1';
  const view = servicesPage(hh, me, today, 'month');
  const facts = view.figures.month.facts;
  const operator = await viewerIsDeveloper();
  const address = billsAddress(hh);
  const count = listServices(hh.id, { viewer: me.id }).length;
  const thisMonth = view.periods.month;
  const dm = new Intl.DateTimeFormat(hh.locale, {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });
  const dmy = new Intl.DateTimeFormat(hh.locale, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
  const date = (ymd: string) =>
    (ymd.slice(0, 4) === today.slice(0, 4) ? dm : dmy).format(new Date(`${ymd}T00:00:00Z`));
  const whole = (minor: number) => money(minor, hh.currency, { whole: minor >= 100_000 });
  const paidSoFar = facts.lens === 'month' ? facts.paidMinor : 0;
  const paidBills = facts.lens === 'month' ? facts.paidBills : 0;
  const toCome = facts.lens === 'month' ? facts.toCome : 0;
  const paidParts = formatMoneyParts(paidSoFar, hh.currency, hh.locale);
  const change = (p: number) =>
    p < 0
      ? tr('lower', { pct: pct(Math.abs(p)) })
      : p > 0
        ? tr('higher', { pct: pct(Math.abs(p)) })
        : null;

  /** The muted line under a row's name: the provider, its usage, how it compares. */
  const subOf = (tile: ServiceTile): string => {
    const parts: string[] = [];
    if (tile.kind === 'group') {
      parts.push(
        tile.category === 'vehicle'
          ? t('tile.vehicles', { count: tile.count ?? 0 })
          : t('tile.count', { count: tile.count ?? 0 }),
      );
      const next = [tile.line, tile.fact].find((x) => x.kind === 'next' && x.minor);
      if (next && next.kind === 'next' && next.minor && tile.chip.kind !== 'none')
        parts.push(tr('nextIs', { amount: whole(next.minor) }));
    } else {
      if (tile.provider) parts.push(tile.provider);
      if (tile.mine) parts.push(tr('yours'));
    }
    const said = (x: TileText): string | null => {
      switch (x.kind) {
        case 'usage':
          return tr('usage', { qty: qty(x.perDay), unit: unitLabel(x.unit) });
        case 'usageOfLimit':
          return tr('ofLimit', { pct: pct(x.pct) });
        case 'samePrice':
          return tr('samePrice');
        case 'vsLastYear':
        case 'unusual':
          return change(x.pct);
        default:
          return null;
      }
    };
    for (const x of [tile.line, tile.fact]) {
      const w = said(x);
      if (w && !parts.includes(w)) parts.push(w);
    }
    return parts.join(' · ');
  };

  /** The status column: a pill when something is due, paid or expected; muted words otherwise. */
  const statusOf = (tile: ServiceTile) => {
    const c = tile.chip;
    if (c.kind === 'paid')
      return (
        <StatusPill tone="ok">
          {tile.kind === 'group' ? tr('paidOn', { date: date(c.dueDate) }) : tr('paid')}
        </StatusPill>
      );
    if (c.kind === 'overdue')
      return (
        <StatusPill tone="bad">
          {tu('status.overdue', { n: Math.abs(c.days), date: date(c.dueDate) })}
        </StatusPill>
      );
    if (c.kind === 'today' || c.kind === 'tomorrow' || c.kind === 'soon' || c.kind === 'due')
      return <StatusPill tone="soon">{tu('status.due', { date: date(c.dueDate) })}</StatusPill>;
    if (c.kind === 'expected')
      return <StatusPill tone="soon">{tr('expectedOn', { date: date(c.dueDate) })}</StatusPill>;
    if (c.kind === 'unusual') return <StatusPill tone="soon">{tr('unusual')}</StatusPill>;
    // Nothing this month: when the next bill is expected, named for a main service.
    const next = [tile.fact, tile.line].find((x) => x.kind === 'next');
    if (next && next.kind === 'next')
      return (
        <Later>
          {next.name
            ? tr('nextNamed', { name: next.name, date: date(next.dueDate) })
            : tr('nextAbout', { date: date(next.dueDate) })}
        </Later>
      );
    return <Later>{tile.kind === 'group' ? tr('nothingThisMonth') : tr('nothingDue')}</Later>;
  };

  const row = (tile: ServiceTile) => (
    <ListRow
      key={tile.key}
      href={tile.href}
      icon={tile.icon}
      name={tile.kind === 'group' && tile.category ? tm(`main.${tile.category}`) : tile.name}
      sub={subOf(tile)}
      status={statusOf(tile)}
      amount={
        tile.figureMinor === null
          ? null
          : tile.approx
            ? tr('approx', { amount: money(tile.figureMinor) })
            : money(tile.figureMinor)
      }
      variant={tile.quiet ? 'quiet' : undefined}
    />
  );
  const subtotal = (tiles: ServiceTile[]) =>
    tr('thisMonth', { amount: money(tiles.reduce((s, x) => s + (x.figureMinor ?? 0), 0)) });

  // The cards: the household's groups when there are any; otherwise Essentials and Other services.
  const grouped = view.sections.some((s) => s.group);
  const cards: { id: string; title: string; tiles: ServiceTile[] }[] = [];
  if (grouped) {
    view.sections.forEach((sec, i) =>
      cards.push({
        id: sec.group?.id ?? `loose-${i}`,
        title: sec.group?.name ?? tr('other'),
        tiles: sec.tiles,
      }),
    );
  } else {
    const all = view.sections.flatMap((s) => s.tiles);
    const ess = all.filter((x) => x.essential);
    const rest = all.filter((x) => !x.essential);
    if (ess.length) cards.push({ id: 'essentials', title: tr('essentials'), tiles: ess });
    if (rest.length) cards.push({ id: 'other', title: tr('other'), tiles: rest });
  }
  view.mine.forEach((sec, i) =>
    cards.push({
      id: sec.group?.id ?? `mine-${i}`,
      title: sec.group
        ? `${t('month.myServices')} · ${sec.group.name}`
        : view.mine.length > 1
          ? `${t('month.myServices')} · ${t('month.otherServices')}`
          : t('month.myServices'),
      tiles: sec.tiles,
    }),
  );

  return (
    <div className="scr">
      <PageTitle
        title={t('title')}
        lede={count ? tr('lede', { count }) : t('ledeEmpty')}
        right={
          <>
            {count > 0 && (
              <LinkButton
                href={arranging ? '/services' : '/services?arrange=1'}
                variant="secondary"
                icon={arranging ? 'check' : 'layers'}
                aria-expanded={arranging}
              >
                {arranging ? t('arrangeDone') : t('arrange')}
              </LinkButton>
            )}
            <LinkButton href="/services/new" variant="secondary" icon="plus">
              {t('add')}
            </LinkButton>
          </>
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
          {/* The month's summary: paid so far, bills paid, bills expected, Budget. */}
          <section
            className="rd-card rd-pad sv-sum"
            aria-label={tr('soFar', { month: month(thisMonth, 'long') })}
          >
            <div>
              <p className="lbl sv-sum-l">{tr('soFar', { month: month(thisMonth, 'long') })}</p>
              <div className="hero-num sm">
                {paidParts.main}
                {paidParts.minor && <span className="cents">{paidParts.minor}</span>}
                {paidParts.tail}
              </div>
            </div>
            <div className="sv-sum-r">
              {paidBills > 0 && (
                <StatusPill tone="ok">{tr('billsPaid', { count: paidBills })}</StatusPill>
              )}
              {toCome > 0 && (
                <StatusPill tone="soon">{tr('expected', { count: toCome })}</StatusPill>
              )}
              <Link href="/budget" className="tlink sv-sum-link">
                {tr('analytics')}
                <Icon name="arrow-right" width={16} height={16} />
              </Link>
            </div>
          </section>
          {/* Group: the groups and order, dragged (SCOPE-header.md H-D3). */}
          {arranging && <ServicesArrange hh={hh} me={me} today={ctx.today} />}
          {cards.map((c) => (
            <RowCard key={c.id} id={`sv-${c.id}`} title={c.title} right={subtotal(c.tiles)}>
              {c.tiles.map(row)}
            </RowCard>
          ))}
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
  );
}
