import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { logout } from '@/app/login/actions';
import { AppearanceFade } from '@/components/app/appearance-fade';
import { PresetCards } from '@/components/app/preset-cards';
import { Button, Card, LinkButton } from '@/components/ui';
import { AddressCard, Kv, PageTitle, SectionHead } from '@/components/ui/blocks';
import { Avatars } from '@/components/ui/colour';
import { Segmented } from '@/components/ui/controls';
import { InlineAction } from '@/components/ui/form';
import { authState, viewerIsOperator } from '@/lib/auth/session';
import { billsAddress } from '@/lib/bills-address';
import { pageContext } from '@/lib/context';
import { getEnv, isInboundEmailConfigured, isLlmConfigured } from '@/lib/env';
import { catchUpCount, isReadingMetrics } from '@/ingest/metrics';
import {
  countriesWithData,
  countryFromLocale,
  describeLocation,
  hasPostcodeData,
} from '@/lib/location';
import { isActiveOn, listMembers } from '@/lib/members';
import { latestRegionalChoice, regionalEnabled } from '@/lib/regional';
import { isAdmin } from '@/lib/roles';
import { householdClimate } from '@/lib/seasons';
import { saveNotifyPrefsAction } from '../members/actions';
import { NotifyForm } from '../members/notify-form';
import {
  exitDemoAction,
  readMissingMetricsAction,
  removeLocationAction,
  replaceBillsAddressAction,
  saveAppearanceAction,
  saveSharingAction,
} from './actions';
import { LocationForm } from './location-form';
import { SettingsForm } from './settings-form';
import { UpdateCard } from './update-card';

/**
 * Settings: how the app looks for this person first, then their account,
 * what it emails them, and the household (members, the bills address, the
 * household's own settings, location, area comparisons), with the admin and
 * operator tools after.
 */
export default async function SettingsPage() {
  const { hh, me, today } = await pageContext();
  const operator = await viewerIsOperator();
  const admin = isAdmin(me);
  const address = billsAddress(hh);
  const env = getEnv();
  const t = await getTranslations('settings');
  const ta = await getTranslations('appearance');
  const tn = await getTranslations('nav');
  const tl = await getTranslations('location');
  const ts = await getTranslations('sharing');
  const tp = await getTranslations('notify.prefs');
  const tb = await getTranslations('billsAddress');
  const state = await authState();
  const account = state.kind === 'ok' ? state.account : null;
  const members = listMembers(hh.id);
  const living = members.filter((m) => isActiveOn(m, today));
  const choice = latestRegionalChoice(hh.id);
  const place = describeLocation(hh);
  const climate = householdClimate(hh);
  const missing = catchUpCount(hh.id);
  const reading = isReadingMetrics(hh.id);
  const months = Array.from({ length: 12 }, (_, i) =>
    new Intl.DateTimeFormat(hh.locale, { month: 'long' }).format(new Date(2026, i, 1)),
  );
  const days = Array.from({ length: 7 }, (_, i) =>
    new Intl.DateTimeFormat(hh.locale, { weekday: 'long' }).format(new Date(2026, 1, 1 + i)),
  );
  const names = new Intl.ListFormat(hh.locale, { type: 'conjunction' }).format(
    living.map((m) => m.name),
  );
  const householdLine = [
    living.length <= 1 ? t('household.justYou') : names,
    admin ? t('household.youAdmin') : t('household.youMember'),
    hh.splitMode === 'shared' ? null : t('household.notSplit'),
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <div className="scr settings">
      <PageTitle title={t('title')} lede={t('lede')} />
      <div className="set-grid">
        <Card className="set-appear" id="appearance">
          <SectionHead title={ta('title')} right={<span className="muted">{ta('justYou')}</span>} />
          <p className="muted set-lede">{ta('body', { household: hh.name })}</p>
          <AppearanceFade>
            <form action={saveAppearanceAction}>
              <PresetCards current={me.appearancePreset} />
            </form>
            <div className="set-row">
              <span>
                <b>{ta('lightOrDark')}</b>
                <span className="muted small">{ta('lightOrDarkBody')}</span>
              </span>
              <form action={saveAppearanceAction}>
                <Segmented
                  small
                  name="theme"
                  value={me.theme}
                  label={ta('lightOrDark')}
                  items={[
                    { value: 'light', label: ta('themes.light'), icon: 'sun' },
                    { value: 'dark', label: ta('themes.dark'), icon: 'moon' },
                    { value: 'auto', label: ta('themes.auto'), icon: 'devices' },
                  ]}
                />
              </form>
            </div>
            <div className="set-row">
              <span>
                <b>{ta('glass')}</b>
                <span className="muted small">{ta('glassBody')}</span>
              </span>
              <form action={saveAppearanceAction}>
                <Segmented
                  small
                  name="glass"
                  value={me.glass}
                  label={ta('glass')}
                  items={[
                    { value: 'clear', label: ta('glassModes.clear'), icon: 'layers' },
                    { value: 'solid', label: ta('glassModes.solid'), icon: 'grid' },
                    { value: 'auto', label: ta('glassModes.auto'), icon: 'devices' },
                  ]}
                />
              </form>
            </div>
          </AppearanceFade>
        </Card>

        <div className="set-col">
          <Card id="account">
            <SectionHead title={tn('account')} />
            <Kv
              rows={[
                [t('account.name'), me.name],
                [
                  t('account.email'),
                  account ? (
                    <span key="e" className="mono">
                      {account.email}
                    </span>
                  ) : (
                    t('account.demo')
                  ),
                ],
                [
                  t('account.signsInWith'),
                  account
                    ? account.googleSub
                      ? t('account.google')
                      : t('account.code')
                    : t('account.demoSignIn'),
                ],
                [
                  t('account.pin'),
                  me.pinHash
                    ? t('account.pinSet', { days: env.AUTH_SESSION_DAYS })
                    : t('account.pinNone'),
                ],
              ]}
            />
            <div className="set-acts">
              <LinkButton
                href={`/members/${me.id}/edit#pin`}
                variant="secondary"
                size="sm"
                icon="lock"
              >
                {t('account.changePin')}
              </LinkButton>
              <LinkButton href="/wall" variant="secondary" size="sm" icon="desktop">
                {tn('wall')}
              </LinkButton>
              <form action={logout}>
                <Button variant="ghost" size="sm">
                  {tn('logout')}
                </Button>
              </form>
            </div>
          </Card>

          <Card id="emails">
            <SectionHead title={t('emails.title')} />
            {account ? (
              <NotifyForm
                action={saveNotifyPrefsAction}
                initial={{
                  bills: me.notifyBills,
                  reminders: me.notifyReminders,
                  problems: me.notifyProblems,
                }}
              />
            ) : (
              <p className="muted small">{tp('noEmail')}</p>
            )}
          </Card>

          <Card id="household">
            <SectionHead
              title={t('household.title')}
              right={
                <Link href="/members" className="btn btn-plain btn-sm">
                  {tn('members')}
                </Link>
              }
            />
            <div className="set-hh">
              <Avatars
                members={living.map((m) => ({ name: m.name, colour: m.colour }))}
                size="md"
              />
              <span>
                <b>{hh.name}</b>
                <span className="muted small">{householdLine}</span>
              </span>
            </div>
            {address ? (
              <div id="bills-address">
                <AddressCard label={tb('label')} address={address} />
                <p className="set-note mt-2">{tb('howForward')}</p>
                {admin && (
                  <div className="set-acts">
                    <InlineAction
                      action={replaceBillsAddressAction}
                      label={tb('replace')}
                      variant="ghost"
                      confirm={tb('replaceConfirm')}
                    />
                  </div>
                )}
              </div>
            ) : (
              operator && <p className="set-note">{t('household.noAddress')}</p>
            )}
            <SettingsForm
              readOnly={!admin}
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
          </Card>

          <Card id="location">
            <SectionHead title={tl('title')} />
            <p className="muted small">{tl('body')}</p>
            {place ? (
              <p className="mt-2">
                <b>{place}</b>
                {hh.region && <span className="muted"> · {hh.region}</span>}
                <span className="muted small block">
                  {climate.hemisphere === 'south' ? tl('southern') : tl('northern')} ·{' '}
                  {climate.climate === 'tropical' ? tl('tropical') : tl('temperate')}
                </span>
              </p>
            ) : (
              <p className="muted mt-2">{tl('none')}</p>
            )}
            {admin && (
              <div className="mt-3">
                <LocationForm
                  withData={countriesWithData()}
                  initial={{
                    country: hh.country ?? countryFromLocale(hh.locale) ?? 'AU',
                    postalCode: hh.postalCode ?? '',
                    locality: hh.locality ?? '',
                  }}
                />
              </div>
            )}
            {admin && place && (
              <div className="set-acts">
                <InlineAction action={removeLocationAction} label={tl('remove')} variant="ghost" />
              </div>
            )}
            {hh.country && hasPostcodeData(hh.country) && (
              <p className="set-note mt-3">{tl('attribution')}</p>
            )}
          </Card>

          {regionalEnabled() && (
            <Card id="sharing">
              <SectionHead title={ts('title')} />
              <p className="muted small">{ts('body', { k: env.REGIONAL_MIN_HOUSEHOLDS })}</p>
              <p className="set-note mt-2">{ts('shared')}</p>
              <p className="set-note">{ts('never')}</p>
              {admin ? (
                <form action={saveSharingAction}>
                  <div className="tg-row mt-3">
                    <span>
                      <b>{ts('checkbox')}</b>
                      <span className="muted small">{ts('checkboxHint')}</span>
                    </span>
                    <label className="toggle">
                      <input
                        type="checkbox"
                        role="switch"
                        name="share"
                        defaultChecked={hh.shareRegional}
                        aria-label={ts('checkbox')}
                      />
                      <i aria-hidden="true" />
                    </label>
                  </div>
                  <div className="set-acts">
                    <Button type="submit" variant="secondary" size="sm">
                      {ts('save')}
                    </Button>
                  </div>
                </form>
              ) : (
                <p className="mt-3">{hh.shareRegional ? ts('onMember') : ts('offMember')}</p>
              )}
              {choice && (
                <p className="set-note mt-2">
                  {ts(choice.granted ? 'since.on' : 'since.off', {
                    date: new Intl.DateTimeFormat(hh.locale, { dateStyle: 'medium' }).format(
                      new Date(choice.at),
                    ),
                  })}
                </p>
              )}
              <Link href="/privacy" className="btn btn-plain btn-sm mt-2">
                {ts('privacy')}
              </Link>
            </Card>
          )}

          {admin && isLlmConfigured(env) && (missing > 0 || reading) && (
            <Card>
              <SectionHead title={t('metrics.title')} />
              <p className="muted small">
                {reading ? t('metrics.reading') : t('metrics.body', { count: missing })}
              </p>
              {!reading && (
                <div className="set-acts">
                  <InlineAction
                    action={readMissingMetricsAction}
                    label={t('metrics.start', { count: missing })}
                    variant="secondary"
                  />
                </div>
              )}
            </Card>
          )}

          {hh.isDemo && admin && (
            <Card className="bg-warning-soft">
              <SectionHead title={t('demo.title')} />
              <p className="muted small">{t('demo.body')}</p>
              <div className="set-acts">
                <InlineAction
                  action={exitDemoAction}
                  label={t('demo.exit')}
                  variant="danger"
                  confirm={t('demo.confirm')}
                />
              </div>
            </Card>
          )}

          {operator && <UpdateCard hh={hh} />}
          {operator && (
            <Card>
              <SectionHead
                title={t('system.title')}
                right={
                  <Link href="/status" className="btn btn-plain btn-sm">
                    {t('system.status')}
                  </Link>
                }
              />
              <Kv
                rows={[
                  [
                    t('system.dataDir'),
                    <span key="d" className="mono small">
                      {env.DATA_DIR}
                    </span>,
                  ],
                  [
                    t('system.billsAddresses'),
                    isInboundEmailConfigured(env)
                      ? t('system.configured')
                      : t('system.notConfigured'),
                  ],
                  [
                    t('system.llm'),
                    isLlmConfigured(env) ? t('system.configured') : t('system.notConfigured'),
                  ],
                  [t('system.demoMode'), env.DEMO_MODE ? t('system.on') : t('system.off')],
                ]}
              />
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
