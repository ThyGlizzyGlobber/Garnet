import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { isSetUp } from '@/lib/households';
import { getEnv } from '@/lib/env';
import { addDays, todayIn } from '@/lib/dates';
import { SetupWizard } from './wizard';

export const dynamic = 'force-dynamic';

export default async function SetupPage() {
  if (isSetUp()) redirect('/');
  const env = getEnv();
  const t = await getTranslations('setup');
  return (
    <>
      <main className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center px-4 py-10">
        <p className="text-sm font-medium text-fg-muted">{t('eyebrow')}</p>
        <h1 className="mt-1 mb-6 text-3xl font-semibold tracking-tight">{t('title')}</h1>
        <SetupWizard
          defaults={{
            currency: env.DEFAULT_CURRENCY,
            locale: env.DEFAULT_LOCALE,
            timezone: env.DEFAULT_TIMEZONE,
            fiscalYearStartMonth: env.DEFAULT_FISCAL_YEAR_START_MONTH,
            activeFrom: addDays(todayIn(env.DEFAULT_TIMEZONE), -365),
          }}
          timezones={Intl.supportedValuesOf('timeZone')}
        />
      </main>
    </>
  );
}
