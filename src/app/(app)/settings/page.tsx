import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { Card, PageHeader } from '@/components/ui';
import { Icon } from '@/components/app/icons';
import { IconDisc } from '@/components/ui/colour';
import { Ring } from '@/components/ui/ring';
import { aiAllowance } from '@/lib/usage';
import { listMembers } from '@/lib/members';
import { BillsAddressCard } from '@/components/app/bills-address';
import { viewerIsOperator } from '@/lib/auth/session';
import { billsAddress } from '@/lib/bills-address';
import { pageContext } from '@/lib/context';
import { getEnv, isInboundEmailConfigured, isLlmConfigured } from '@/lib/env';
import { SettingsForm } from './settings-form';
import { InlineAction } from '@/components/ui/form';
import { PresetCards } from '@/components/app/preset-cards';
import {
  exitDemoAction,
  readMissingMetricsAction,
  removeLocationAction,
  saveSharingAction,
  replaceBillsAddressAction,
  saveAppearanceAction,
} from './actions';
import { catchUpCount, isReadingMetrics } from '@/ingest/metrics';
import { UpdateCard } from './update-card';
import { LocationForm } from './location-form';
import {
  countriesWithData,
  countryFromLocale,
  describeLocation,
  hasPostcodeData,
} from '@/lib/location';
import { householdClimate } from '@/lib/seasons';
import { latestRegionalChoice, regionalEnabled } from '@/lib/regional';
import { isAdmin } from '@/lib/roles';

export default async function SettingsPage() {
  const { hh, me } = await pageContext();
  const operator = await viewerIsOperator();
  const address = billsAddress(hh);
  const t = await getTranslations('settings');
  const env = getEnv();
  const ta = await getTranslations('appearance');
  const tl = await getTranslations('location');
  const ts = await getTranslations('sharing');
  const tg = await getTranslations('settings.glance');
  const choice = latestRegionalChoice(hh.id);
  const minHouseholds = getEnv().REGIONAL_MIN_HOUSEHOLDS;
  const place = describeLocation(hh);
  const climate = householdClimate(hh);
  const withData = countriesWithData();
  const missing = catchUpCount(hh.id);
  const reading = isReadingMetrics(hh.id);
  const demo = hh.isDemo;
  const months = Array.from({ length: 12 }, (_, i) =>
    new Intl.DateTimeFormat(hh.locale, { month: 'long' }).format(new Date(2026, i, 1)),
  );
  const days = Array.from({ length: 7 }, (_, i) =>
    new Intl.DateTimeFormat(hh.locale, { weekday: 'long' }).format(new Date(2026, 1, 1 + i)),
  );
  const ai = aiAllowance(hh.id);
  const memberCount = listMembers(hh.id).length;
  const facts: { icon: string; label: string; value: string; href: string }[] = [
    { icon: 'people', label: tg('members'), value: String(memberCount), href: '/members' },
    { icon: 'pin', label: tg('location'), value: place ?? tg('notSet'), href: '#location' },
    {
      icon: 'mail',
      label: tg('billsAddress'),
      value: address ? tg('ready') : tg('notSet'),
      href: address ? '#bills-address' : '/status',
    },
    ...(regionalEnabled()
      ? [
          {
            icon: 'chart',
            label: tg('sharing'),
            value: hh.shareRegional ? tg('on') : tg('off'),
            href: '#sharing',
          },
        ]
      : []),
  ];
  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title={t('title')} subtitle={isAdmin(me) ? undefined : t('ownerOnly')} />

      <section className="glass mb-4 flex flex-wrap items-center gap-6 rounded-card bg-accent-soft p-5">
        <div className="flex min-w-0 items-center gap-4">
          <IconDisc icon="home" colour="var(--color-accent)" variant="glow" size={56} />
          <span className="flex min-w-0 flex-col leading-tight">
            <span className="truncate font-display text-2xl font-semibold">{hh.name}</span>
            <span className="text-xs text-fg-muted">
              {tg('region', { currency: hh.currency, locale: hh.locale, timezone: hh.timezone })}
            </span>
          </span>
        </div>
        <ul className="grid flex-grow grid-cols-2 gap-2 sm:grid-cols-4">
          {facts.map((f) => (
            <li key={f.label}>
              <Link
                href={f.href}
                className="flex items-center gap-2 rounded-2xl bg-surface-2 px-3 py-2 hover:text-accent"
              >
                <Icon name={f.icon} width={16} height={16} className="shrink-0 text-fg-muted" />
                <span className="flex min-w-0 flex-col leading-tight">
                  <span className="text-[11px] tracking-wide text-fg-muted uppercase">
                    {f.label}
                  </span>
                  <span className="truncate text-sm font-semibold">{f.value}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
        <Link href="/status" className="flex items-center gap-3" aria-label={tg('aiReads')}>
          <Ring
            id="settings-ai"
            pct={ai.limit ? Math.min(100, (ai.used / ai.limit) * 100) : 0}
            size={64}
            stroke={7}
          >
            <span className="text-sm font-semibold tabular-nums">{ai.used}</span>
          </Ring>
          <span className="flex flex-col leading-tight">
            <span className="text-[11px] tracking-wide text-fg-muted uppercase">
              {tg('aiReads')}
            </span>
            <span className="text-sm font-semibold">
              {ai.limit === null ? tg('noCap') : tg('ofLimit', { limit: ai.limit })}
            </span>
          </span>
        </Link>
      </section>

      <Card className="mb-4 flex flex-col gap-4" id="appearance">
        <div className="flex items-center justify-between gap-3">
          <SectionTitle icon="sun">{ta('title')}</SectionTitle>
          <span className="text-sm text-fg-2">{ta('justYou')}</span>
        </div>
        <p className="max-w-[56ch] text-sm text-fg-2">{ta('body', { household: hh.name })}</p>
        <form action={saveAppearanceAction}>
          <PresetCards current={me.appearancePreset} />
        </form>
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 border-t border-line pt-4">
          <span className="flex min-w-0 flex-col">
            <b className="font-semibold">{ta('lightOrDark')}</b>
            <span className="text-sm text-fg-2">{ta('lightOrDarkBody')}</span>
          </span>
          <form action={saveAppearanceAction} className="flex flex-wrap gap-2">
            {(['light', 'dark', 'auto'] as const).map((th) => (
              <button
                key={th}
                name="theme"
                value={th}
                aria-pressed={me.theme === th}
                className={`rounded-full px-4 py-2 text-sm font-semibold transition ${me.theme === th ? 'bg-accent text-on-accent' : 'glass-ctl text-fg-2 hover:text-fg'}`}
              >
                {ta(`themes.${th}`)}
              </button>
            ))}
          </form>
        </div>
      </Card>

      <div className="grid items-start gap-4 lg:grid-cols-2">
        <div className="flex flex-col gap-4">
          <SettingsForm
            readOnly={!isAdmin(me)}
            timezones={Intl.supportedValuesOf('timeZone')}
            months={months}
            days={days}
            initial={{
              name: hh.name,
              currency: hh.currency,
              locale: hh.locale,
              timezone: hh.timezone,
              fiscalYearStartMonth: hh.fiscalYearStartMonth,
              weekStartsOn: hh.weekStartsOn,
              splitMode: hh.splitMode,
              paymentReferenceTemplate: hh.paymentReferenceTemplate,
              membersCanExport: hh.membersCanExport,
            }}
          />
          {demo && isAdmin(me) && (
            <Card className="flex flex-col gap-3 border-warning/40 bg-warning-soft">
              <h2 className="font-display font-semibold">{t('demo.title')}</h2>
              <p className="text-xs text-fg-muted">{t('demo.body')}</p>
              <InlineAction
                action={exitDemoAction}
                label={t('demo.exit')}
                variant="danger"
                confirm={t('demo.confirm')}
              />
            </Card>
          )}
        </div>
        <div className="flex flex-col gap-4">
          <Card className="flex flex-col gap-3" id="location">
            <SectionTitle icon="pin">{tl('title')}</SectionTitle>
            <p className="text-xs text-fg-muted">{tl('body')}</p>
            {place ? (
              <p className="text-sm">
                <span className="font-semibold">{place}</span>
                {hh.region && <span className="text-fg-muted"> · {hh.region}</span>}
                <span className="block text-xs text-fg-muted">
                  {climate.hemisphere === 'south' ? tl('southern') : tl('northern')} ·{' '}
                  {climate.climate === 'tropical' ? tl('tropical') : tl('temperate')}
                </span>
              </p>
            ) : (
              <p className="text-sm text-fg-muted">{tl('none')}</p>
            )}
            {isAdmin(me) && (
              <LocationForm
                withData={withData}
                initial={{
                  country: hh.country ?? countryFromLocale(hh.locale) ?? 'AU',
                  postalCode: hh.postalCode ?? '',
                  locality: hh.locality ?? '',
                }}
              />
            )}
            {isAdmin(me) && place && (
              <div>
                <InlineAction action={removeLocationAction} label={tl('remove')} variant="ghost" />
              </div>
            )}
            {hh.country && hasPostcodeData(hh.country) && (
              <p className="text-[11px] text-fg-muted">{tl('attribution')}</p>
            )}
          </Card>
          {regionalEnabled() && (
            <Card className="flex flex-col gap-3" id="sharing">
              <SectionTitle icon="chart">{ts('title')}</SectionTitle>
              <p className="text-sm text-fg-muted">{ts('body', { k: minHouseholds })}</p>
              <ul className="list-disc space-y-1 pl-5 text-xs text-fg-muted">
                <li>{ts('shared')}</li>
                <li>{ts('never')}</li>
              </ul>
              {isAdmin(me) ? (
                <form action={saveSharingAction} className="flex flex-col gap-3">
                  <label className="flex items-start gap-3 text-sm font-medium">
                    <input
                      type="checkbox"
                      name="share"
                      defaultChecked={hh.shareRegional}
                      className="mt-0.5 size-5 accent-accent"
                    />
                    <span>
                      {ts('checkbox')}
                      <span className="block text-xs font-normal text-fg-muted">
                        {ts('checkboxHint')}
                      </span>
                    </span>
                  </label>
                  <div>
                    <button
                      type="submit"
                      className="rounded-full bg-surface-2 px-4 py-2 text-sm font-semibold hover:text-accent"
                    >
                      {ts('save')}
                    </button>
                  </div>
                </form>
              ) : (
                <p className="text-sm">{hh.shareRegional ? ts('onMember') : ts('offMember')}</p>
              )}
              {choice && (
                <p className="text-xs text-fg-muted">
                  {ts(choice.granted ? 'since.on' : 'since.off', {
                    date: new Intl.DateTimeFormat(hh.locale, { dateStyle: 'medium' }).format(
                      new Date(choice.at),
                    ),
                  })}
                </p>
              )}
              <Link href="/privacy" className="text-xs font-semibold text-accent">
                {ts('privacy')}
              </Link>
            </Card>
          )}
          {address && (
            <div id="bills-address">
              <BillsAddressCard
                address={address}
                replaceAction={isAdmin(me) ? replaceBillsAddressAction : undefined}
              />
            </div>
          )}
          {isAdmin(me) && isLlmConfigured(env) && (missing > 0 || reading) && (
            <Card className="flex flex-col gap-2">
              <SectionTitle icon="sparkle">{t('metrics.title')}</SectionTitle>
              <p className="text-sm text-fg-muted">
                {reading ? t('metrics.reading') : t('metrics.body', { count: missing })}
              </p>
              {!reading && (
                <div>
                  <InlineAction
                    action={readMissingMetricsAction}
                    label={t('metrics.start', { count: missing })}
                    variant="secondary"
                  />
                </div>
              )}
            </Card>
          )}
          {operator && <UpdateCard hh={hh} />}
          <Card>
            <SectionTitle icon="gear">
              <Link href="/status" className="text-accent">
                {t('system.title')} →
              </Link>
            </SectionTitle>
            <dl className="mt-2 grid grid-cols-2 gap-2 text-sm">
              {operator && (
                <>
                  <dt className="text-fg-muted">{t('system.dataDir')}</dt>
                  <dd className="truncate font-mono text-xs">{env.DATA_DIR}</dd>
                  <dt className="text-fg-muted">{t('system.billsAddresses')}</dt>
                  <dd>
                    {isInboundEmailConfigured(env)
                      ? t('system.configured')
                      : t('system.notConfigured')}
                  </dd>
                </>
              )}
              <dt className="text-fg-muted">{t('system.llm')}</dt>
              <dd>{isLlmConfigured(env) ? t('system.configured') : t('system.notConfigured')}</dd>
              <dt className="text-fg-muted">{t('system.demoMode')}</dt>
              <dd>{env.DEMO_MODE ? t('system.on') : t('system.off')}</dd>
            </dl>
          </Card>
        </div>
      </div>
    </div>
  );
}

/** A card heading with a small glowing icon disc (visual system v2). */
function SectionTitle({ icon, children }: { icon: string; children: React.ReactNode }) {
  return (
    <h2 className="flex items-center gap-3 font-display font-semibold">
      <IconDisc icon={icon} colour="var(--color-accent)" variant="glow" size={36} />
      {children}
    </h2>
  );
}
