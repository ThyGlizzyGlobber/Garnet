import { getTranslations } from 'next-intl/server';
import { logout } from '@/app/login/actions';
import { changePinAction, signOutOtherDevicesAction } from '@/app/(app)/members/actions';
import { saveAppearanceAction } from '@/app/(app)/settings/actions';
import { AppearanceFade } from '@/components/app/appearance-fade';
import { NewPinForm } from '@/components/app/auth-forms';
import { Button } from '@/components/ui';
import { PageTitle } from '@/components/ui/blocks';
import { Avatar } from '@/components/ui/colour';
import { Segmented } from '@/components/ui/controls';
import { InlineAction } from '@/components/ui/form';
import { getAppearance } from '@/lib/auth/appearance';
import { countDevices } from '@/lib/auth/devices';
import { getEnv } from '@/lib/env';
import { accountContext } from '../context';
import { NameForm, PhotoButtons } from '../profile-forms';

/**
 * Account (SCOPE-redesign-2.md §4): the one page for your details, how you
 * sign in and how Garnet looks. An identity card (photo, name, email, Add
 * photo), Personal details (the name as a value with Edit, not an open
 * field), Sign-in and security (how, created, last sign-in, the PIN with a
 * Change PIN button that reveals the form, the devices signed in as you),
 * and Appearance (Light · Dark · Automatic).
 */
export default async function AccountSettingsPage() {
  const { account, view, name, colour, photo, locale } = await accountContext();
  const t = await getTranslations('profile');
  const tr = await getTranslations('profile.rd');
  const ta = await getTranslations('appearance');
  const ts = await getTranslations('settings.account');
  const env = getEnv();
  const look = await getAppearance();
  const date = (iso: string | null | undefined) =>
    iso ? new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(new Date(iso)) : '—';
  const devices = account ? countDevices(account.id) : 0;
  const method =
    view.method === 'google'
      ? ts('google')
      : view.method === 'code'
        ? ts('code')
        : ts('demoSignIn');

  return (
    <div className="scr account">
      <PageTitle title={tr('title')} lede={tr('lede')} />
      <div className="ac-col">
        {/* Who you are. */}
        <section className="rd-card ac-id" aria-label={name}>
          <div className="ac-id-l">
            <Avatar name={name} colour={colour} photo={photo} size="lg" className="av-xl" />
            <div className="min-w-0">
              <div className="ac-id-name">{name}</div>
              {view.email && <div className="ac-id-mail">{view.email}</div>}
            </div>
          </div>
          {account ? <PhotoButtons hasPhoto={!!photo} /> : <p className="lr-sub">{t('demo')}</p>}
        </section>

        {/* Personal details: values with Edit, not open fields. */}
        <section className="rd-card" aria-labelledby="ac-pd">
          <div className="shead">
            <h2 id="ac-pd">{tr('personal')}</h2>
          </div>
          <div className="srow">
            <span className="k">{tr('name')}</span>
            {account ? (
              <details className="srow-edit">
                <summary>
                  <span className="v">{account.name}</span>
                  <span className="tlink">{tr('edit')}</span>
                </summary>
                <div className="srow-form">
                  <NameForm initial={account.name} />
                </div>
              </details>
            ) : (
              <>
                <span className="v">{name}</span>
                <span />
              </>
            )}
          </div>
          <div className="srow">
            <span className="k">{tr('email')}</span>
            <span className="v">{view.email ?? t('demoEmail')}</span>
            <span />
          </div>
          <div className="srow">
            <span className="k">{tr('photo')}</span>
            <span className="v">
              {photo ? t('photo.set') : <span className="v-quiet">{t('photo.unset')}</span>}
            </span>
            <span />
          </div>
          <p className="note">{tr('everywhere', { count: view.tiles.length })}</p>
        </section>

        {/* Sign-in and security. */}
        <section className="rd-card" aria-labelledby="ac-si">
          <div className="shead">
            <h2 id="ac-si">{tr('security')}</h2>
          </div>
          <div className="srow">
            <span className="k">{tr('signsInWith')}</span>
            <span className="v">{method}</span>
            <span />
          </div>
          {account && (
            <>
              <div className="srow">
                <span className="k">{tr('created')}</span>
                <span className="v">{date(account.createdAt)}</span>
                <span />
              </div>
              <div className="srow">
                <span className="k">{tr('lastSignIn')}</span>
                <span className="v">{date(account.lastSignInAt)}</span>
                <span />
              </div>
              <div className="srow">
                <span className="k">{tr('pin')}</span>
                {view.hasPin ? (
                  <details className="srow-edit">
                    <summary>
                      <span className="v">
                        {tr('pinSet')}
                        <span className="v-quiet">
                          {tr('pinEvery', { days: env.AUTH_SESSION_DAYS })}
                        </span>
                      </span>
                      <span className="btn btn-glass btn-sm">{tr('changePin')}</span>
                    </summary>
                    <div className="srow-form">
                      <NewPinForm action={changePinAction} withCurrent />
                    </div>
                  </details>
                ) : (
                  <>
                    <span className="v">{tr('pinNone')}</span>
                    <span />
                  </>
                )}
              </div>
              <div className="srow">
                <span className="k">{tr('devices')}</span>
                <span className="v">{tr('devicesLine', { count: devices })}</span>
                <span className="srow-acts">
                  {devices > 1 && (
                    <InlineAction
                      action={signOutOtherDevicesAction}
                      label={tr('signOutOthers')}
                      variant="secondary"
                      confirm={t('security.signOutOthersConfirm')}
                    />
                  )}
                  <form action={logout}>
                    <Button variant="ghost" size="sm" icon="logout">
                      {tr('signOut')}
                    </Button>
                  </form>
                </span>
              </div>
            </>
          )}
          <p className="note">{tr('noPassword')}</p>
        </section>

        {/* Appearance: light or dark, yours on every device. */}
        <section className="rd-card" aria-labelledby="ac-ap">
          <div className="shead">
            <h2 id="ac-ap">{tr('appearance')}</h2>
            <p>{tr('appearanceLede')}</p>
          </div>
          <AppearanceFade>
            <div className="srow srow-top">
              <span className="k">{tr('lightOrDark')}</span>
              <span className="v ac-theme">
                <form action={saveAppearanceAction}>
                  <Segmented
                    small
                    name="theme"
                    value={look.theme}
                    label={ta('lightOrDark')}
                    items={[
                      { value: 'light', label: ta('themes.light'), icon: 'sun' },
                      { value: 'dark', label: ta('themes.dark'), icon: 'moon' },
                      { value: 'auto', label: ta('themes.auto'), icon: 'devices' },
                    ]}
                  />
                </form>
                <span className="v-quiet">{ta('lightOrDarkBody')}</span>
              </span>
              <span />
            </div>
          </AppearanceFade>
          <div className="msec-end" />
        </section>
      </div>
    </div>
  );
}
