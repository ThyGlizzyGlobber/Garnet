import { getTranslations } from 'next-intl/server';
import { Card } from '@/components/ui';
import { authState } from '@/lib/auth/session';
import { pageContext } from '@/lib/context';
import { saveNotifyPrefsAction } from '../../members/actions';
import { NotifyForm } from '../../members/notify-form';
import { SettingsSubPage } from '../sub-page';

/** Which emails this person gets: new bills, reminders, payment problems. */
export default async function NotificationsPage() {
  const { me } = await pageContext();
  const t = await getTranslations('settings.index');
  const tp = await getTranslations('notify.prefs');
  const state = await authState();
  const account = state.kind === 'ok' ? state.account : null;
  return (
    <SettingsSubPage title={t('notifications.title')} lede={t('notifications.lede')}>
      <Card>
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
    </SettingsSubPage>
  );
}
