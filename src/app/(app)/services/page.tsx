import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { lowerFirst, relativeDay, rowCtx, statusLabel } from '@/components/app/bill-rows';
import { Badge, Button, Card, Field, Input, LinkButton, Select } from '@/components/ui';
import { EmptyCard, PageTitle } from '@/components/ui/blocks';
import { Disc } from '@/components/ui/colour';
import { Segmented } from '@/components/ui/controls';
import { CopyButton } from '@/components/ui/copy';
import { viewerIsOperator } from '@/lib/auth/session';
import { billsAddress } from '@/lib/bills-address';
import { pageContext } from '@/lib/context';
import { daysBetween } from '@/lib/dates';
import { formatMonthRange } from '@/lib/format';
import { colourCss } from '@/lib/palette';
import { groupTypes } from '@/lib/service-categories';
import { listServiceTypes, listServices } from '@/lib/services';
import {
  isLevel,
  periodDays,
  servicesView,
  type ServiceRibbon,
  type ServiceScope,
} from '@/lib/services-view';
import { listUnits } from '@/lib/units';
import { createServiceTypeAction } from './actions';

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
  const { hh, me, money, month } = ctx;
  const t = await getTranslations('services');
  const tu = await getTranslations('ui');
  const rc = rowCtx(ctx, tu);
  const hasMine = listServices(hh.id, { owner: me.id, includeInactive: true }).length > 0;
  const scope: ServiceScope =
    hasMine && (SCOPES as string[]).includes(requested ?? '') ? (requested as ServiceScope) : 'all';
  const view = servicesView(hh, me.id, ctx.today, scope);
  const operator = await viewerIsOperator();
  const address = billsAddress(hh);
  const count = view.services.length;

  const sentence = (s: ServiceRibbon): string => {
    const parts: string[] = [];
    if (s.instalment)
      parts.push(
        t('ribbon.instalments', {
          n: s.instalment.n,
          of: s.instalment.of,
          when: relativeDay(
            rc,
            daysBetween(ctx.today, s.instalment.dueDate),
            s.instalment.dueDate,
          ).toLowerCase(),
        }),
      );
    else if (s.vsLastYear !== null && !isLevel(s.vsLastYear))
      parts.push(
        t('ribbon.vsLastYear', {
          pct: Math.round(Math.abs(s.vsLastYear) * 100),
          dir: s.vsLastYear > 0 ? 'up' : 'down',
        }),
      );
    else if (s.vsLastYear !== null) parts.push(t('ribbon.levelLastYear'));
    else if (s.personal) parts.push(t('ribbon.yours'));
    else if (s.percentages) parts.push(t('ribbon.split', { parts: s.percentages.join(' / ') }));
    if (s.unusual) parts.push(t('ribbon.unusual'));
    if (s.nextDue && !s.instalment) parts.push(t('ribbon.next', { date: rc.dateYear(s.nextDue) }));
    if (s.latest)
      parts.push(
        t('ribbon.last', {
          amount: money(s.latest.amountMinor),
          status: lowerFirst(statusLabel(rc, s.latest.status)),
        }),
      );
    return parts.join(' ');
  };

  const ribbon = (s: ServiceRibbon) => (
    <Card key={s.id} className="d3-svc" style={{ ['--svc' as string]: colourCss(s.colour) }}>
      <Link href={`/services/${s.id}`} className="d3-svc-l">
        <Disc icon={s.icon} colour={s.colour} />
        <span>
          <b>{s.name}</b>
          <span className="muted">{s.provider}</span>
        </span>
      </Link>
      <div className="d3-svc-fig">
        <span className="fig fig-md">{money(s.yearMinor, hh.currency, { whole: true })}</span>
        <span className="muted small">{t('ribbon.year', { count: s.yearBills })}</span>
      </div>
      <div className="d3-rib">
        <div className="d3-rib-track">
          {s.blocks.map((b) => {
            const tip = `${formatMonthRange(b.periodStart, b.periodEnd, hh.locale)} · ${money(b.amountMinor)} · ${statusLabel(rc, b.status)}`;
            return (
              <Link
                key={b.billId}
                href={`/bills/${b.billId}`}
                className={`rb s-${b.status.key === 'today' || b.status.key === 'tomorrow' ? 'soon' : b.status.key}${b.clipped ? ' clip' : ''}${b.unusual ? ' flag' : ''}`}
                style={{ left: `calc(${b.left}% + 1px)`, width: `calc(${b.width}% - 2px)` }}
                data-tip={tip}
                aria-label={`${s.name} ${tip} · ${periodDays(b)} d`}
              >
                <span>
                  {b.width > 12 ? money(b.amountMinor, hh.currency, { whole: true }) : ''}
                </span>
              </Link>
            );
          })}
          <i className="today-line" style={{ left: `${view.window.today}%` }}>
            <span>{t('ribbon.today')}</span>
          </i>
        </div>
        <div className="d3-rib-axis" aria-hidden="true">
          {view.window.months.map((m, i) => (
            <span key={m.label} style={{ left: `${m.left}%` }}>
              {i % 3 === 0 ? month(m.label, 'short') : ''}
            </span>
          ))}
        </div>
      </div>
      <p className="d3-svc-sum">{sentence(s)}</p>
    </Card>
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
        view.services.map(ribbon)
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
