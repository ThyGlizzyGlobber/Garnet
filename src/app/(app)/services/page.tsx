import Link from 'next/link';
import { SERVICE_CATEGORIES } from '@/lib/service-categories';
import { getTranslations } from 'next-intl/server';
import { Icon } from '@/components/app/icons';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  LinkButton,
  PageHeader,
  Select,
} from '@/components/ui';
import { pageContext } from '@/lib/context';
import { listMembers } from '@/lib/members';
import { darkVariant } from '@/lib/palette';
import { nextMonth, projectMonth } from '@/lib/projections';
import { listServices, listServiceTypes } from '@/lib/services';
import { listUnits, unitLabel } from '@/lib/units';
import { Sparkline } from '@/components/charts/sparkline';
import { monthlySeries } from '@/lib/stats';
import { listBills } from '@/lib/bills';
import { lastMonths } from '@/lib/periods';
import { monthOf } from '@/lib/dates';
import { createServiceTypeAction } from './actions';

/** Tinted tile background in the service's colour, readable in both schemes. */
function tint(colour: string) {
  const c = `light-dark(${colour}, ${darkVariant(colour)})`;
  return {
    background: `linear-gradient(160deg, color-mix(in srgb, ${c} 30%, var(--color-surface-solid)), color-mix(in srgb, ${c} 10%, var(--color-surface-solid)))`,
    borderColor: `color-mix(in srgb, ${c} 45%, transparent)`,
  };
}

export default async function ServicesPage() {
  const { hh, me, money, date, today } = await pageContext();
  const t = await getTranslations('services');
  const services = listServices(hh.id, { includeInactive: true });
  const members = new Map(listMembers(hh.id).map((m) => [m.id, m.name]));
  const types = listServiceTypes();
  const proj = new Map(
    projectMonth(hh.id, nextMonth(today)).services.map((p) => [p.service.id, p]),
  );
  const history = monthlySeries(hh.id, lastMonths(monthOf(today), 12));
  // This member's own services (nobody else sees them), with their latest bill.
  const personal = listServices(hh.id, { includeInactive: true, owner: me.id });
  const personalHistory = monthlySeries(hh.id, lastMonths(monthOf(today), 12), undefined, {
    owner: me.id,
  });

  const tileFor = (
    s: (typeof services)[number],
    next: { amount: string; line: string; history: number[] },
  ) => {
    const swatch = `light-dark(${s.colour}, ${darkVariant(s.colour)})`;
    return (
      <Link
        key={s.id}
        href={`/services/${s.id}`}
        className="glass lift flex min-h-52 flex-col justify-between rounded-card p-5 text-fg"
        style={tint(s.colour)}
      >
        <div className="flex items-start justify-between gap-3">
          <span className="flex items-center gap-3">
            <span
              className="grid size-10 place-items-center rounded-full bg-surface-2"
              style={{ color: swatch }}
            >
              <Icon name={s.type.icon} width={18} height={18} />
            </span>
            <span className="flex flex-col leading-tight">
              <span className="text-[11px] font-semibold tracking-wide text-fg-muted uppercase">
                {s.type.label}
              </span>
              <span className="font-display text-base font-semibold">{s.name}</span>
            </span>
          </span>
          <span className="flex flex-col items-end gap-1">
            {!s.isActive && <Badge>{t('inactive')}</Badge>}
            {s.ownerMemberId ? (
              <Badge>{t('onlyYou')}</Badge>
            ) : (
              hh.splitMode === 'shared' && (
                <Badge tone="accent">{t(`form.splitModes.${s.splitMode}`)}</Badge>
              )
            )}
          </span>
        </div>
        <div className="mt-4">
          <span className="text-xs font-semibold text-fg-muted">
            {s.ownerMemberId ? t('personal.lastTitle') : t('tile.next')}
          </span>
          <p
            className="font-display text-[34px] leading-none font-semibold tracking-tight tabular-nums"
            style={{ color: swatch }}
          >
            {next.amount}
          </p>
          <p className="mt-1 text-xs text-fg-muted">{next.line}</p>
        </div>
        <div className="mt-3 -mx-1">
          <Sparkline values={next.history} colour={s.colour} height={36} />
        </div>
        <p className="mt-2 truncate text-xs text-fg-muted">
          {s.provider} · {t(`form.cadences.${s.cadence}`)}
          {s.usageUnit && ` · ${unitLabel(s.usageUnit)}`}
          {hh.splitMode === 'shared' &&
            !s.ownerMemberId &&
            ` · ${s.payerMemberId ? t('tile.payer', { name: members.get(s.payerMemberId) ?? '?' }) : t('tile.noPayer')}`}
        </p>
      </Link>
    );
  };

  return (
    <>
      <PageHeader
        title={t('title')}
        action={<LinkButton href="/services/new">{t('add')}</LinkButton>}
      />
      {services.length === 0 ? (
        <EmptyState
          title={t('empty.title')}
          body={t('empty.body')}
          action={<LinkButton href="/services/new">{t('add')}</LinkButton>}
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {services.map((s) => {
            const p = proj.get(s.id);
            return tileFor(s, {
              amount: p?.nextBill ? money(p.nextBill.amountMinor) : '—',
              line: p?.nextBill
                ? `${t('tile.due', { date: date(p.nextBill.dueDate, 'short') })} · ${t('tile.perDay', { amount: money(Math.round(p.perDay)) })}`
                : t('tile.noHistory'),
              history: history.map((r) => r.byService[s.id] ?? 0),
            });
          })}
          <Link
            href="/services/new"
            className="glass flex min-h-44 flex-col items-center justify-center gap-2 rounded-card border-dashed p-5 text-fg-muted transition hover:text-fg"
          >
            <span className="grid size-10 place-items-center rounded-full bg-surface-2">
              <Icon name="plus" width={18} height={18} />
            </span>
            <span className="text-sm font-semibold">{t('add')}</span>
          </Link>
        </div>
      )}
      {personal.length > 0 && (
        <section className="mt-8">
          <h2 className="font-display text-lg font-semibold">{t('personal.title')}</h2>
          <p className="mb-3 text-xs text-fg-muted">{t('personal.body')}</p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {personal.map((s) => {
              const last = listBills(hh.id, { serviceId: s.id, limit: 1 })[0];
              return tileFor(s, {
                amount: last ? money(last.amountMinor, last.currency) : '—',
                line: last
                  ? t('personal.last', { date: date(last.dueDate, 'short') })
                  : t('tile.noHistory'),
                history: personalHistory.map((r) => r.byService[s.id] ?? 0),
              });
            })}
          </div>
        </section>
      )}
      <Card className="mt-6">
        <h2 className="font-display font-semibold">{t('types.title')}</h2>
        <p className="mt-0.5 text-xs text-fg-muted">{t('types.body')}</p>
        <dl className="mt-3 flex flex-col gap-2">
          {SERVICE_CATEGORIES.map((c) => {
            const inGroup = types.filter((ty) => ty.category === c);
            if (!inGroup.length) return null;
            return (
              <div key={c} className="flex flex-wrap items-baseline gap-1.5">
                <dt className="w-20 shrink-0 text-xs font-semibold text-fg-muted">
                  {t(`categories.${c}`)}
                </dt>
                <dd className="flex flex-1 flex-wrap gap-1.5">
                  {inGroup.map((ty) => (
                    <Badge key={ty.slug}>{ty.label}</Badge>
                  ))}
                </dd>
              </div>
            );
          })}
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
    </>
  );
}
