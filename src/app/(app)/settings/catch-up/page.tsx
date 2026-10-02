import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { Card } from '@/components/ui';
import { InlineAction } from '@/components/ui/form';
import { catchUpCount, isReadingMetrics } from '@/ingest/metrics';
import { pageContext } from '@/lib/context';
import { getEnv, isLlmConfigured } from '@/lib/env';
import { isAdmin } from '@/lib/roles';
import { readMissingMetricsAction } from '../actions';
import { SettingsSubPage } from '../sub-page';

/** Usage details from earlier bills: analyse the bills that came in before figures were kept (admins). */
export default async function CatchUpPage() {
  const { hh, me } = await pageContext();
  if (!isAdmin(me) || !isLlmConfigured(getEnv())) redirect('/settings');
  const t = await getTranslations('settings.metrics');
  const missing = catchUpCount(hh.id);
  const reading = isReadingMetrics(hh.id);
  return (
    <SettingsSubPage title={t('title')}>
      <Card>
        <p className="muted small">
          {reading ? t('reading') : missing ? t('body', { count: missing }) : t('done')}
        </p>
        {!reading && missing > 0 && (
          <div className="set-acts">
            <InlineAction
              action={readMissingMetricsAction}
              label={t('start', { count: missing })}
              variant="secondary"
            />
          </div>
        )}
      </Card>
    </SettingsSubPage>
  );
}
