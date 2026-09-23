import { getTranslations } from 'next-intl/server';
import { Card, PageHeader } from '@/components/ui';
import { pageContext } from '@/lib/context';
import { getEnv, isImapConfigured, isLlmConfigured } from '@/lib/env';
import { SettingsForm } from './settings-form';

export default async function SettingsPage() {
  const { hh, me } = await pageContext();
  const t = await getTranslations('settings');
  const env = getEnv();
  const months = Array.from({ length: 12 }, (_, i) =>
    new Intl.DateTimeFormat(hh.locale, { month: 'long' }).format(new Date(2026, i, 1)),
  );
  const days = Array.from({ length: 7 }, (_, i) =>
    new Intl.DateTimeFormat(hh.locale, { weekday: 'long' }).format(new Date(2026, 1, 1 + i)),
  );
  return (
    <div className="mx-auto max-w-xl">
      <PageHeader title={t('title')} subtitle={me.role === 'owner' ? undefined : t('ownerOnly')} />
      <SettingsForm
        readOnly={me.role !== 'owner'}
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
        }}
      />
      <Card className="mt-4">
        <h2 className="font-semibold">{t('system.title')}</h2>
        <dl className="mt-2 grid grid-cols-2 gap-2 text-sm">
          <dt className="text-fg-muted">{t('system.dataDir')}</dt>
          <dd className="truncate font-mono text-xs">{env.DATA_DIR}</dd>
          <dt className="text-fg-muted">{t('system.mailbox')}</dt>
          <dd>{isImapConfigured(env) ? t('system.configured') : t('system.notConfigured')}</dd>
          <dt className="text-fg-muted">{t('system.llm')}</dt>
          <dd>{isLlmConfigured(env) ? t('system.configured') : t('system.notConfigured')}</dd>
          <dt className="text-fg-muted">{t('system.demoMode')}</dt>
          <dd>{env.DEMO_MODE ? t('system.on') : t('system.off')}</dd>
        </dl>
      </Card>
    </div>
  );
}
