import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { rowCtx, statusLabel } from '@/components/app/bill-rows';
import { Icon } from '@/components/app/icons';
import { Badge, Button, Card, Field, Input, LinkButton, Select } from '@/components/ui';
import { EmptyCard, PageTitle, Stats } from '@/components/ui/blocks';
import { StatusChip } from '@/components/ui/chip';
import { Disc } from '@/components/ui/colour';
import { Segmented } from '@/components/ui/controls';
import { CopyButton } from '@/components/ui/copy';
import { viewerIsOperator } from '@/lib/auth/session';
import { billsAddress } from '@/lib/bills-address';
import { pageContext } from '@/lib/context';
import { colourCss } from '@/lib/palette';
import { addMonths } from '@/lib/periods';
import { groupTypes } from '@/lib/service-categories';
import { listServiceTypes, listServices } from '@/lib/services';
import {
  servicesMonth,
  type MonthEntry,
  type MonthItem,
  type MonthScope,
} from '@/lib/services-month';
import { listUnits } from '@/lib/units';
import { createServiceTypeAction } from './actions';

const SCOPES: MonthScope[] = ['all', 'household', 'mine'];

/**
 * Services, one month at a time: what each service billed this month, where
 * it stands and how it compares with the bill before, or when the next is
 * expected. Main services (Vehicles, Subscriptions…) fold their services
 * away, closed by default. Numbers from servicesMonth().
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
  const operator = await viewerIsOperator();
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

  const row = (i: MonthItem) => {
    const s = i.service;
    return (
      <Link
        key={s.id}
        href={`/services/${s.id}`}
        className={`sm-row${i.bills.length ? '' : ' is-quiet'}`}
        style={{ ['--svc' as string]: colourCss(s.colour) }}
      >
        <Disc icon={s.type.icon} colour={s.colour} size="sm" />
        <span className="sm-name">
          <b>{s.name}</b>
          <span className="muted small">
            {[s.provider !== s.name ? s.provider : null, s.ownerMemberId ? tmain('yours') : null]
              .filter(Boolean)
              .join(' · ')}
          </span>
        </span>
        <span className="sm-amt fig">
          {i.bills.length
            ? money(i.amountMinor)
            : i.expected?.amountMinor
              ? `~${money0(i.expected.amountMinor)}`
              : '—'}
        </span>
        <span className="sm-st">{standing(i)}</span>
        <span
          className={`sm-ch small${i.change?.dir === 'up' ? ' up' : i.change?.dir === 'down' ? ' down' : ''}`}
        >
          {i.change && i.change.dir !== 'same' && (
            <Icon name={i.change.dir === 'up' ? 'arrow-up' : 'arrow-down'} width={13} height={13} />
          )}
          {change(i)}
        </span>
      </Link>
    );
  };

  const entry = (e: MonthEntry) => {
    if (e.kind === 'service') return row(e.item);
    const name = e.category ? tmain(`main.${e.category}`) : e.label;
    const page = e.category ? `/services/category/${e.category}` : `/services/group/${e.typeSlug}`;
    const billed = e.items.some((i) => i.bills.length);
    // Nothing due yet: what's expected this month, added up.
    const expectedMinor = e.items
      .filter((i) => i.expected && i.expected.dueDate.slice(0, 7) === picked)
      .reduce((sum, i) => sum + (i.expected!.amountMinor ?? 0), 0);
    return (
      <details key={e.key} className="sm-grp" style={{ ['--svc' as string]: colourCss(e.colour) }}>
        <summary className={`sm-row${billed ? '' : ' is-quiet'}`}>
          <Disc icon={e.icon} colour={e.colour} size="sm" />
          <span className="sm-name">
            <b>{name}</b>
            <span className="muted small">{tm('count', { count: e.items.length })}</span>
          </span>
          <span className="sm-amt fig">
            {billed ? money(e.amountMinor) : expectedMinor ? `~${money0(expectedMinor)}` : '—'}
          </span>
          <span className="sm-st">
            {e.status ? (
              <StatusChip status={{ label: statusLabel(rc, e.status), tone: e.status.tone }} />
            ) : e.toCome ? (
              <StatusChip status={{ label: tm('toComeChip', { count: e.toCome }), tone: 'info' }} />
            ) : (
              <span className="muted small">{tm('nothing')}</span>
            )}
          </span>
          <span className="sm-ch">
            <Icon name="chevron-down" width={16} height={16} className="sm-chev" />
          </span>
        </summary>
        <div className="sm-sub">
          {e.items.map((i) => row(i))}
          <Link href={page} className="sm-open small">
            {tm('open', { name })}
            <Icon name="chevron-right" width={14} height={14} />
          </Link>
        </div>
      </details>
    );
  };

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
          <Card className="sm-list">{view.entries.map(entry)}</Card>
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
