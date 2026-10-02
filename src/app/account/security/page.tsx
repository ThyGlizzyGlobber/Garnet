import { getTranslations } from 'next-intl/server';
import { logout } from '@/app/login/actions';
import { changePinAction, signOutOtherDevicesAction } from '@/app/(app)/members/actions';
import { NewPinForm } from '@/components/app/auth-forms';
import { Button, Card } from '@/components/ui';
import { Kv, PageTitle, SectionHead } from '@/components/ui/blocks';
import { InlineAction } from '@/components/ui/form';
import { countDevices } from '@/lib/auth/devices';
import { getEnv } from '@/lib/env';
import { accountContext } from '../context';

/** How you sign in, your PIN, and the browsers signed in as you. */
export default async function SecurityPage() {
  const { account, view, locale } = await accountContext();
  const t = await getTranslations('profile.security');
  const ts = await getTranslations('settings.account');
  const tn = await getTranslations('nav');
  const env = getEnv();
  const date = (iso: string | null | undefined) =>
    iso ? new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(new Date(iso)) : '—';
  const devices = account ? countDevices(account.id) : 0;
  return (
    <div className="scr account pf">
      <PageTitle title={t('title')} lede={t('lede')} />
      <div className="pf-grid">
        <Card>
          <SectionHead title={t('signIn')} />
          <Kv
            rows={[
              [ts('email'), view.email ?? ts('demo')],
              [
                ts('signsInWith'),
                view.method === 'google'
                  ? ts('google')
                  : view.method === 'code'
                    ? ts('code')
                    : ts('demoSignIn'),
              ],
              [t('created'), date(account?.createdAt)],
              [t('lastSignIn'), date(account?.lastSignInAt)],
            ]}
          />
          <p className="set-note mt-2">{t('noPassword')}</p>
        </Card>
        <Card>
          <SectionHead title={ts('pin')} />
          <p className="muted small">
            {view.hasPin ? ts('pinSet', { days: env.AUTH_SESSION_DAYS }) : ts('pinNone')}
          </p>
          {account && view.hasPin && (
            <div className="mt-3">
              <NewPinForm action={changePinAction} withCurrent />
            </div>
          )}
        </Card>
        <Card>
          <SectionHead title={t('devices')} />
          <p className="muted small">
            {account ? t('devicesBody', { count: devices }) : t('devicesDemo')}
          </p>
          <div className="set-acts">
            {account && devices > 1 && (
              <InlineAction
                action={signOutOtherDevicesAction}
                label={t('signOutOthers')}
                variant="secondary"
                confirm={t('signOutOthersConfirm')}
              />
            )}
            <form action={logout}>
              <Button variant="ghost" size="sm">
                {tn('logout')}
              </Button>
            </form>
          </div>
        </Card>
      </div>
    </div>
  );
}
