import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { Card } from '@/components/ui';
import { Kv } from '@/components/ui/blocks';
import { viewerIsDeveloper } from '@/lib/auth/session';
import { getEnv, isInboundEmailConfigured, isLlmConfigured } from '@/lib/env';
import { SettingsSubPage } from '../sub-page';

/** The install's set-up at a glance (developers). */
export default async function SystemPage() {
  if (!(await viewerIsDeveloper())) notFound();
  const t = await getTranslations('settings.system');
  const env = getEnv();
  return (
    <SettingsSubPage title={t('title')}>
      <Card>
        <Kv
          rows={[
            [
              t('dataDir'),
              <span key="d" className="mono small">
                {env.DATA_DIR}
              </span>,
            ],
            [
              t('billsAddresses'),
              isInboundEmailConfigured(env) ? t('configured') : t('notConfigured'),
            ],
            [t('llm'), isLlmConfigured(env) ? t('configured') : t('notConfigured')],
            [t('demoMode'), env.DEMO_MODE ? t('on') : t('off')],
          ]}
        />
        <Link href="/console/health" className="btn btn-plain btn-sm mt-2">
          {t('status')}
        </Link>
      </Card>
    </SettingsSubPage>
  );
}
