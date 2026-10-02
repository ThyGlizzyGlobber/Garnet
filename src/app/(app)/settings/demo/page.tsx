import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { Card } from '@/components/ui';
import { InlineAction } from '@/components/ui/form';
import { pageContext } from '@/lib/context';
import { isAdmin } from '@/lib/roles';
import { exitDemoAction } from '../actions';
import { SettingsSubPage } from '../sub-page';

/** Leave the demo household and set up a real one (admins of a demo household). */
export default async function DemoPage() {
  const { hh, me } = await pageContext();
  if (!hh.isDemo || !isAdmin(me)) redirect('/settings');
  const t = await getTranslations('settings.demo');
  return (
    <SettingsSubPage title={t('title')}>
      <Card className="bg-warning-soft">
        <p className="muted small">{t('body')}</p>
        <div className="set-acts">
          <InlineAction
            action={exitDemoAction}
            label={t('exit')}
            variant="danger"
            confirm={t('confirm')}
          />
        </div>
      </Card>
    </SettingsSubPage>
  );
}
