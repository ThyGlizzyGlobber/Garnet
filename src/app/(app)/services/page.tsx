import Link from 'next/link';
import { Fragment, type ReactNode } from 'react';
import { getTranslations } from 'next-intl/server';
import { rowCtx, statusLabel } from '@/components/app/bill-rows';
import { Icon } from '@/components/app/icons';
import { Sparkline } from '@/components/charts/sparkline';
import { Badge, Button, Card, Field, Input, LinkButton, Select } from '@/components/ui';
import { EmptyCard, PageTitle, SectionHead, Stats } from '@/components/ui/blocks';
import { StatusChip } from '@/components/ui/chip';
import { Disc } from '@/components/ui/colour';
import { Segmented } from '@/components/ui/controls';
import { CopyButton } from '@/components/ui/copy';
import { viewerIsDeveloper } from '@/lib/auth/session';
import { billsAddress } from '@/lib/bills-address';
import { pageContext } from '@/lib/context';
import { colourCss } from '@/lib/palette';
import { addMonths } from '@/lib/periods';
import { arrange, arrangeMine } from '@/lib/nav-layout';
import { getNavLayout } from '@/lib/nav-store';
import { groupTypes, isEssential } from '@/lib/service-categories';
import { listServiceTypes, listServices } from '@/lib/services';
import {
  servicesMonth,
  type MonthEntry,
  type MonthItem,
  type MonthScope,
} from '@/lib/services-month';
import { listUnits } from '@/lib/units';
import { createServiceTypeAction } from './actions';
import { ServicesArrange } from './arrange';

const SCOPES: MonthScope[] = ['all', 'household', 'mine'];

/**
 * Services, one month at a time: a tile per service (and per main service:
 * Vehicles, Health, Lifestyle, Subscriptions, each opening its page) with
 * what's due this month, a year's line, where it stands and how it compares
 * with the bill before, in the groups and order the viewer gave the side
 * menu. Numbers from servicesMonth().
 */
export default async function ServicesPage({
  searchParams,
}: {
  searchParams: Promise<{ scope?: string; m?: string }>;
}) {
  const { scope: requested, m } = await searchParams;
  const ctx = await pageContext();
  const { hh, me, money, month } = ctx;
  const t = await getTranslations('services');
  const tm = await getTranslations('services.month');
  const tmain = await getTranslations('main');
  const rc = rowCtx(ctx, await getTranslations('ui'));
  const hasMine = listServices(hh.id, { owner: me.id, includeInactive: true }).length > 0;
  const scope: MonthScope =
    hasMine && (SCOPES as string[]).includes(requested ?? '') ? (requested as MonthScope) : 'all';
  const thisMonth = ctx.today.slice(0, 7);
  // Any month up to next month (?m=YYYY-MM); this month by default.
  const picked = /^\d{4}-\d{2}$/.test(m ?? '') && m! <= addMonths(thisMonth, 1) ? m! : thisMonth;
  const view = servicesMonth(hh, me.id, ctx.today, picked, scope);
  const operator = await viewerIsDeveloper();
  const address = billsAddress(hh);
  const count = listServices(hh.id, { viewer: me.id }).length;
  const href = (q: { m?: string | null; scope?: MonthScope }) => {
    const p = new URLSearchParams();
    const mm = q.m === undefined ? picked : q.m;
    const sc = q.scope ?? scope;
    if (mm && mm !== thisMonth) p.set('m', mm);
    if (sc !== 'all') p.set('scope', sc);
    const s = p.toString();
    return s ? `/services?${s}` : '/services';
  };
  const money0 = (minor: number) => money(minor, hh.currency, { whole: minor >= 100_000 });

  /** Where it stands this month, as a chip or a quiet line. */
  const standing = (i: MonthItem) => {
    if (i.status)
      return <StatusChip status={{ label: statusLabel(rc, i.status), tone: i.status.tone }} />;
    if (i.expected)
      return i.expected.dueDate.slice(0, 7) === picked ? (
        <StatusChip
          status={{ label: tm('expected', { date: rc.date(i.expected.dueDate) }), tone: 'info' }}
        />
      ) : (
        <span className="muted small">
          {tm('nextOn', { date: rc.dateYear(i.expected.dueDate) })}
          {i.expected.amountMinor ? ` · ~${money0(i.expected.amountMinor)}` : ''}
        </span>
      );
    return (
      <span className="muted small">
        {i.lastMonth ? tm('last', { month: month(i.lastMonth, 'short') }) : tm('none')}
      </span>
    );
  };
  // "Sep", or "Oct 2025" when it was another year.
  const when = (ym: string) =>
    ym.slice(0, 4) === picked.slice(0, 4)
      ? month(ym, 'short')
      : `${month(ym, 'short')} ${ym.slice(0, 4)}`;
  const change = (i: MonthItem) =>
    i.change
      ? i.change.dir === 'same'
        ? tm('same', { month: when(i.change.month) })
        : tm(i.change.dir, {
            pct: `${Math.round(Math.abs(i.change.pct) * 100)}%`,
            month: when(i.change.month),
          })
      : i.bills.length > 1
        ? tm('bills', { count: i.bills.length })
        : '';

  /** A tile: the service (or main service), this month's amount, a year's line, where it stands. */
  const tile = (t: {
    key: string;
    href: string;
    icon: string;
    colour: string;
    name: string;
    meta: string;
    amount: string;
    quiet: boolean;
    spark: number[];
    foot: ReactNode;
    change?: MonthItem['change'];
    changeText?: string;
  }) => (
    <Link
      key={t.key}
      href={t.href}
      className={`glass st-tile rounded-card${t.quiet ? ' is-quiet' : ''}`}
      style={{ ['--svc' as string]: colourCss(t.colour) }}
    >
      <span className="st-h">
        <Disc icon={t.icon} colour={t.colour} size="sm" />
        <span className="st-t">
          <b>{t.name}</b>
          {t.meta && <span className="muted small">{t.meta}</span>}
        </span>
      </span>
      <span className="st-fig fig">{t.amount}</span>
      {t.spark.some((v) => v > 0) ? (
        <Sparkline values={t.spark} colour={t.colour} className="st-spark" />
      ) : (
        <span className="st-spark" />
      )}
      <span className="st-foot">
        {t.foot}
        {t.changeText && (
          <span
            className={`st-ch small${t.change?.dir === 'up' ? ' up' : t.change?.dir === 'down' ? ' down' : ''}`}
          >
            {t.change && t.change.dir !== 'same' && (
              <Icon
                name={t.change.dir === 'up' ? 'arrow-up' : 'arrow-down'}
                width={12}
                height={12}
              />
            )}
            {t.changeText}
          </span>
        )}
      </span>
    </Link>
  );

  const entry = (e: MonthEntry) => {
    if (e.kind === 'service') {
      const i = e.item;
      const s = i.service;
      return tile({
        key: s.id,
        href: `/services/${s.id}`,
        icon: s.type.icon,
        colour: s.colour,
        name: s.name,
        meta: [s.provider !== s.name ? s.provider : null, s.ownerMemberId ? tmain('yours') : null]
          .filter(Boolean)
          .join(' · '),
        // This month's figure: what's due, or what's expected this month.
        amount: i.bills.length
          ? money(i.amountMinor)
          : i.expected?.amountMinor && i.expected.dueDate.slice(0, 7) === picked
            ? `~${money0(i.expected.amountMinor)}`
            : '—',
        quiet: !i.bills.length,
        spark: i.spark,
        foot: standing(i),
        change: i.change,
        changeText: change(i),
      });
    }
    const name = e.category ? tmain(`main.${e.category}`) : e.label;
    const billed = e.items.some((i) => i.bills.length);
    // Nothing due yet: what's expected this month, added up.
    const expectedMinor = e.items
      .filter((i) => i.expected && i.expected.dueDate.slice(0, 7) === picked)
      .reduce((sum, i) => sum + (i.expected!.amountMinor ?? 0), 0);
    return tile({
      key: e.key,
      href: e.category ? `/services/category/${e.category}` : `/services/group/${e.typeSlug}`,
      icon: e.icon,
      colour: e.colour,
      name,
      meta: tm('count', { count: e.items.length }),
      amount: billed ? money(e.amountMinor) : expectedMinor ? `~${money0(expectedMinor)}` : '—',
      quiet: !billed,
      spark: e.spark,
      foot: e.status ? (
        <StatusChip status={{ label: statusLabel(rc, e.status), tone: e.status.tone }} />
      ) : e.toCome ? (
        <StatusChip status={{ label: tm('toComeChip', { count: e.toCome }), tone: 'info' }} />
      ) : (
        <span className="muted small">{tm('nothing')}</span>
      ),
    });
  };

  // The same groups, in the same order, as the viewer's side menu.
  const isEveryday = (e: MonthEntry) => e.kind === 'service' && isEssential(e.item.service.type);
  const layout = getNavLayout(me);
  const sections = arrange(
    view.entries.filter((e) => !e.mine),
    (e) => e.key,
    layout,
    isEveryday,
  ).filter((sec) => sec.entries.length > 0);
  // My Services, the viewer's own, last.
  const mine = arrangeMine(
    view.entries.filter((e) => e.mine),
    (e) => e.key,
    layout,
  ).filter((sec) => sec.entries.length > 0);
  const c = view.counts;
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
            href: href({ scope: v }),
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
      <PageTitle title={t('title')} lede={count ? tm('lede') : t('ledeEmpty')} right={right} />
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
          <Card className="sm-head">
            <nav className="sm-month" aria-label={tm('label')}>
              <Link
                href={href({ m: view.prev })}
                className="btn btn-glass btn-icon"
                aria-label={tm('prev')}
              >
                <Icon name="chevron-left" width={18} height={18} />
              </Link>
              <b>{month(picked, 'long-year')}</b>
              {view.next ? (
                <Link
                  href={href({ m: view.next })}
                  className="btn btn-glass btn-icon"
                  aria-label={tm('next')}
                >
                  <Icon name="chevron-right" width={18} height={18} />
                </Link>
              ) : (
                <span className="btn btn-icon is-off" aria-hidden="true" />
              )}
              {picked !== thisMonth && (
                <Link href={href({ m: null })} className="btn btn-plain btn-sm">
                  {tm('thisMonth')}
                </Link>
              )}
            </nav>
            <Stats
              className="sm-stats"
              stats={[
                {
                  label: tm('billed'),
                  value: money(view.totalMinor, hh.currency, { whole: true }),
                  sub: tm('billedSub', { count: c.bills }),
                },
                { label: tm('paid'), value: String(c.paid), sub: tm('paidSub') },
                {
                  label: tm('toPay'),
                  value: String(c.toPay + c.overdue),
                  sub: c.overdue ? tm('overdueSub', { count: c.overdue }) : tm('toPaySub'),
                },
                { label: tm('toCome'), value: String(c.toCome), sub: tm('toComeSub') },
              ]}
            />
          </Card>
          {/* Arrange: the groups and order, dragged (SCOPE-header.md H-D3). */}
          <ServicesArrange hh={hh} me={me} today={ctx.today} />
          {/* Each of the viewer's groups, then the services in no group, then My Services. */}
          {sections.map((sec, i) => (
            <Fragment key={sec.group?.id ?? 'loose'}>
              {(sec.group || sections.length > 1) && (
                <SectionHead
                  title={sec.group?.name ?? tm('otherServices')}
                  className={i ? 'mt-2' : ''}
                />
              )}
              <div className="st-grid">{sec.entries.map(entry)}</div>
            </Fragment>
          ))}
          {/* My Services: the viewer's own groups, then their own in no group. */}
          {mine.map((sec, i) => (
            <Fragment key={sec.group?.id ?? 'mine'}>
              <SectionHead
                title={
                  sec.group
                    ? `${tm('myServices')} · ${sec.group.name}`
                    : mine.length > 1
                      ? `${tm('myServices')} · ${tm('otherServices')}`
                      : tm('myServices')
                }
                className={sections.length || i ? 'mt-2' : ''}
              />
              <div className="st-grid">{sec.entries.map(entry)}</div>
            </Fragment>
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
