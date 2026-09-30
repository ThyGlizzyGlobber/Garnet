import Link from 'next/link';
import { cookies } from 'next/headers';
import { getTranslations } from 'next-intl/server';
import { SeasonAhead } from '@/components/app/season-ahead';
import { WeatherCard } from '@/components/app/weather-card';
import { Banner, Card, FilterChip, EmptyState, LinkButton, PageHeader } from '@/components/ui';
import { InlineAction } from '@/components/ui/form';
import { pageContext } from '@/lib/context';
import { homeView } from '@/lib/home';
import { LOCATION_PROMPT_COOKIE } from '@/lib/location';
import { hasHousemates } from '@/lib/members';
import { Greeting, ViewToggle } from './_home/parts';
import {
  AnomaliesTile,
  BalancesTile,
  ChartTile,
  ForecastTile,
  MonthTile,
  NextDueTile,
  NoticeCard,
  PerPersonTile,
  RankingTile,
  SettledTile,
  ShareTile,
  UpcomingTile,
  UsageTile,
} from './_home/tiles';
import { PersonalView } from './_home/mine';
import { acknowledgeSharingAction, dismissLocationPromptAction } from './settings/actions';

/**
 * Home: the household dashboard (or, with ?view=mine, the member's own).
 * Every number comes from homeView() (src/lib/home.ts); this only lays out tiles.
 */
export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const ctx = await pageContext();
  const { hh, me, money, date, month, pct } = ctx;
  const t = await getTranslations('dashboard');
  const tp = await getTranslations('personal');
  // Household · Mine: with housemates, each member also has their own view.
  const housemates = hasHousemates(hh.id);
  const mineView = housemates && (await searchParams).view === 'mine';
  const toggle = housemates ? (
    <ViewToggle
      mine={mineView}
      labels={{
        household: tp('toggle.household'),
        mine: tp('toggle.mine'),
        label: tp('toggle.label'),
      }}
    />
  ) : null;
  if (mineView) return <PersonalView ctx={ctx} toggle={toggle} />;

  const v = homeView(hh, me, ctx.today, {
    postcodePromptDismissed: !!(await cookies()).get(LOCATION_PROMPT_COOKIE),
  });
  if (v.empty)
    return (
      <>
        <PageHeader title={t('greeting', { name: me.name })} subtitle={hh.name} action={toggle} />
        <EmptyState
          title={t('empty.title')}
          body={v.empty.hasServices ? t('empty.body') : t('empty.noServices')}
          action={
            <LinkButton href={v.empty.hasServices ? '/bills/new' : '/services/new'}>
              {v.empty.hasServices ? t('empty.addBill') : t('empty.addService')}
            </LinkButton>
          }
        />
      </>
    );

  const tl = await getTranslations('location');
  const tsh = await getTranslations('sharing');
  const thisMonth = month(v.month.month);
  const change = v.month.vsLastMonth === null ? null : pct(Math.abs(v.month.vsLastMonth));
  const reminders = v.banners.myReminders;

  return (
    <>
      <Greeting
        hello={t('greeting', { name: me.name })}
        line={
          v.month.level === null
            ? t('greetingLine.first')
            : v.month.level === 'level'
              ? t('greetingLine.level', { month: thisMonth })
              : t(`greetingLine.${v.month.level}`, { month: thisMonth, pct: change! })
        }
      >
        {toggle}
        <FilterChip active>{thisMonth}</FilterChip>
        <FilterChip href="/bills">{v.summary.fiscalYear.label}</FilterChip>
        <FilterChip href="/services">
          {t('chips.services', { count: v.summary.services.length })}
        </FilterChip>
        {v.shared && (
          <FilterChip href="/members">
            {t('chips.members', { count: v.summary.activeMemberCount })}
          </FilterChip>
        )}
      </Greeting>

      {v.banners.alerts.map((b) => (
        <Banner key={b.id} href={`/bills/${b.id}`} tone="danger" open={t('alertBanner.open')}>
          {t(`alertBanner.${b.alertKind}`, { provider: b.service.provider, due: date(b.dueDate) })}
        </Banner>
      ))}
      {v.banners.whose.map((q) => (
        <Banner
          key={q.service.id}
          href={q.billId ? `/bills/${q.billId}#whose` : `/services/${q.service.id}/edit`}
          tone="accent"
          open={t('whoseBanner.open')}
        >
          {t('whoseBanner.text', { service: q.service.name })}
        </Banner>
      ))}
      {v.banners.plans.map(({ bill: b, fullStillOpen }) => (
        <Banner key={b.id} href={`/bills/${b.id}#plan`} tone="accent" open={t('planBanner.open')}>
          {t(fullStillOpen ? 'planBanner.text' : 'planBanner.textClosed', {
            service: b.service.name,
            count: b.instalments.length,
          })}
        </Banner>
      ))}
      {v.banners.waitingInInbox > 0 && (
        <Banner href="/review" tone="warning" open={t('reviewLink')}>
          {t('reviewBanner', { count: v.banners.waitingInInbox })}
        </Banner>
      )}

      {reminders && (reminders.overdueCount > 0 || reminders.soonCount > 0) && (
        <Card className="mb-4 flex flex-col gap-2 border-warning/30">
          <div className="flex items-center justify-between">
            <span className="font-display font-semibold">{t('reminders.title')}</span>
            <Link href="/ledger" className="text-sm font-semibold text-accent">
              {t('reminders.open')} →
            </Link>
          </div>
          {reminders.overdueCount > 0 && (
            <p className="text-sm font-semibold text-danger">
              {t('reminders.overdue', {
                count: reminders.overdueCount,
                amount: money(reminders.overdueMinor),
              })}
            </p>
          )}
          {reminders.soonCount > 0 && (
            <p className="text-sm font-semibold text-warning">
              {t('reminders.soon', {
                count: reminders.soonCount,
                amount: money(reminders.soonMinor),
              })}
            </p>
          )}
        </Card>
      )}

      {/* Row 1: instruments */}
      <div
        className={`grid gap-4 ${v.shared ? 'lg:grid-cols-[1.3fr_1fr_1fr]' : 'lg:grid-cols-[1.3fr_1fr]'}`}
      >
        <MonthTile v={v} ctx={ctx} />
        {v.share ? <ShareTile v={v} ctx={ctx} /> : <PerPersonTile v={v} ctx={ctx} />}
        <ForecastTile v={v} ctx={ctx} />
      </div>

      {/* Row 2: chart · next due · bills */}
      <div className="mt-4 grid gap-4 lg:grid-cols-[1.6fr_1fr_1fr]">
        <ChartTile v={v} ctx={ctx} />
        <NextDueTile v={v} ctx={ctx} />
        <UpcomingTile v={v} ctx={ctx} />
      </div>

      {/* Row 3: people · settled · ranking, then notes and extras */}
      <div className="mt-4 grid gap-4 lg:grid-cols-[1.6fr_1fr_1fr]">
        {v.shared ? <BalancesTile v={v} ctx={ctx} /> : <AnomaliesTile v={v} ctx={ctx} />}
        {v.shared && <SettledTile v={v} ctx={ctx} />}
        <RankingTile v={v} ctx={ctx} />
        {v.shared && v.anomalies.length > 0 && (
          <AnomaliesTile v={v} ctx={ctx} className="lg:col-span-3" />
        )}

        {v.notices.sharing && (
          <NoticeCard
            title={tsh('notice.title')}
            body={tsh('notice.body')}
            className="lg:col-span-3"
          >
            <InlineAction action={acknowledgeSharingAction} label={tsh('notice.ok')} />
            <LinkButton href="/settings#sharing" variant="secondary">
              {tsh('notice.change')}
            </LinkButton>
            <Link href="/privacy" className="text-sm font-semibold text-accent">
              {tsh('privacy')}
            </Link>
          </NoticeCard>
        )}

        {v.notices.askForPostcode && (
          <NoticeCard title={tl('prompt.title')} body={tl('prompt.body')} className="lg:col-span-3">
            <LinkButton href="/settings#location">{tl('prompt.action')}</LinkButton>
            <InlineAction
              action={dismissLocationPromptAction}
              label={tl('prompt.dismiss')}
              variant="ghost"
            />
          </NoticeCard>
        )}

        {v.weather && (
          <WeatherCard
            week={v.weather}
            locale={hh.locale}
            money={(m) => money(m)}
            className="lg:col-span-3"
          />
        )}

        {v.seasons.length > 0 && (
          <SeasonAhead
            notices={v.seasons}
            locale={hh.locale}
            money={money}
            className="lg:col-span-3"
          />
        )}

        {v.usage.length > 0 && <UsageTile v={v} ctx={ctx} className="lg:col-span-3" />}
      </div>
    </>
  );
}
