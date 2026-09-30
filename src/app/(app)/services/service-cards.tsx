import { getTranslations } from 'next-intl/server';
import { billRowFor, rowCtx, statusLabel, upcomingRowFor } from '@/components/app/bill-rows';
import { CardLink, MainCard } from '@/components/app/main-card';
import { LinkButton } from '@/components/ui';
import { EmptyCard, PageTitle, SectionHead } from '@/components/ui/blocks';
import { BackLink } from '@/components/ui/controls';
import { BillRow, Rows } from '@/components/ui/rows';
import { billDue } from '@/lib/bill-status';
import type { PageContext } from '@/lib/context';
import type { ServiceCard, ServiceCardsView } from '@/lib/main-view';
import { OverviewLayout } from './overview';

/** How many bills a card lists before pointing to the service's own page. */
const SHOWN = 12;

/**
 * A main service's page when its cards are services: Health (Bupa,
 * Ambulance Victoria), Lifestyle (the gym), Subscriptions (Netflix,
 * Spotify), Donations. One card each, opening to its bills; "Add a service"
 * top right; cancelled or stopped ones after. Numbers from serviceCardsView().
 */
export async function ServiceCardsPage({
  ctx,
  view,
  title,
  eyebrow,
  addHref,
  addLabel,
  empty,
  open,
}: {
  ctx: PageContext;
  view: ServiceCardsView;
  title: string;
  eyebrow: string;
  addHref: string;
  addLabel: string;
  empty: { icon: string; title: string; body: string };
  /** The card to open (a service id). */
  open: string | null;
}) {
  const { hh, money, me } = ctx;
  const t = await getTranslations('main');
  const rc = rowCtx(ctx, await getTranslations('ui'));
  const count = view.cards.length + view.stopped.length;
  const only = count === 1;

  const card = (c: ServiceCard) => {
    const svc = c.service;
    const latest = c.bills[0];
    const due = latest ? billDue(latest, ctx.today) : null;
    // What it stands at: a bill still to pay, else the next charge, else the last bill.
    const showUpcoming = c.upcoming && (!due || due.status.key === 'paid');
    const cancelled = !!svc.cancelledAt;
    return (
      <MainCard
        key={svc.id}
        id={`s-${svc.id}`}
        open={open === svc.id || only}
        icon={svc.type.icon}
        colour={svc.colour}
        title={svc.name}
        meta={[
          svc.provider !== svc.name ? svc.provider : null,
          svc.ownerMemberId === me.id ? t('yours') : null,
          t('billCount', { count: c.bills.length }),
        ]
          .filter(Boolean)
          .join(' · ')}
        flag={
          cancelled
            ? c.afterCancel
              ? { label: t('stillCharging'), tone: 'bad' }
              : { label: t('cancelled'), tone: 'neutral' }
            : !svc.isActive
              ? { label: t('stopped'), tone: 'neutral' }
              : undefined
        }
        muted={cancelled || !svc.isActive}
        amount={
          showUpcoming
            ? money(c.upcoming!.amountMinor)
            : due
              ? money(due.amountMinor, latest!.currency)
              : undefined
        }
        status={
          showUpcoming
            ? { label: t('next', { date: rc.dateYear(c.upcoming!.dueDate) }), tone: 'info' }
            : due
              ? { label: statusLabel(rc, due.status), tone: due.status.tone }
              : undefined
        }
        year={t('year', { amount: money(c.yearMinor, hh.currency, { whole: true }) })}
        footer={
          <>
            {c.bills.length > SHOWN && (
              <CardLink href={`/services/${svc.id}`}>
                {t('allBills', { count: c.bills.length })}
              </CardLink>
            )}
            <CardLink href={`/services/${svc.id}`}>{t('details')}</CardLink>
          </>
        }
      >
        {c.bills.length || c.upcoming ? (
          <Rows>
            {c.upcoming && (
              <BillRow
                bill={upcomingRowFor(c.upcoming, svc, rc, { inService: true, noDisc: true })}
              />
            )}
            {c.bills.slice(0, SHOWN).map((b) => (
              <BillRow
                key={b.id}
                bill={billRowFor(b, rc, {
                  inService: true,
                  share: true,
                  noDisc: true,
                  noYours: true,
                })}
              />
            ))}
          </Rows>
        ) : (
          <p className="muted small mcard-empty">{t('noBills')}</p>
        )}
      </MainCard>
    );
  };

  return (
    <div className="scr d3-main-svc">
      <BackLink href="/services">{t('services')}</BackLink>
      <PageTitle
        eyebrow={eyebrow}
        title={title}
        lede={
          count
            ? t('lede', {
                count: view.cards.length,
                stopped: view.stopped.length,
                amount: money(view.yearMinor, hh.currency, { whole: true }),
              })
            : undefined
        }
        right={
          <LinkButton href={addHref} size="sm" icon="plus">
            {addLabel}
          </LinkButton>
        }
      />
      {count === 0 ? (
        <EmptyCard icon={empty.icon} title={empty.title} body={empty.body}>
          <LinkButton href={addHref} icon="plus">
            {addLabel}
          </LinkButton>
        </EmptyCard>
      ) : (
        <OverviewLayout
          ctx={ctx}
          overview={view.overview}
          kind="service"
          count={view.cards.length}
          countSub={
            view.stopped.length ? t('stoppedCount', { count: view.stopped.length }) : t('allGoing')
          }
          seriesName={(_, label) => label}
        >
          <div className="mcards">
            {view.cards.map(card)}
            {view.stopped.length > 0 && (
              <>
                <SectionHead title={t('stoppedHead')} className="mt-2" />
                {view.stopped.map(card)}
              </>
            )}
          </div>
        </OverviewLayout>
      )}
    </div>
  );
}
