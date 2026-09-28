import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { membershipsFor } from '@/lib/accounts';
import { requireAccount } from '@/lib/auth/session';
import { getEnv } from '@/lib/env';
import { addDays, todayIn } from '@/lib/dates';
import { countriesWithData, countryFromLocale } from '@/lib/location';
import { SetupWizard } from './wizard';

export const dynamic = 'force-dynamic';

export default async function SetupPage() {
  const account = await requireAccount();
  if (membershipsFor(account.id).length) redirect('/');
  const env = getEnv();
  const t = await getTranslations('setup');
  return (
    <>
      <main className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center px-4 py-10">
        <div className="window p-6 sm:p-8">
          <p className="text-sm font-medium text-fg-muted">{t('eyebrow')}</p>
          <h1 className="mt-1 mb-6 font-display text-3xl font-semibold tracking-tight">
            {t('title')}
          </h1>
          <SetupWizard
            defaults={{
              currency: env.DEFAULT_CURRENCY,
              locale: env.DEFAULT_LOCALE,
              timezone: env.DEFAULT_TIMEZONE,
              fiscalYearStartMonth: env.DEFAULT_FISCAL_YEAR_START_MONTH,
              activeFrom: addDays(todayIn(env.DEFAULT_TIMEZONE), -365),
              ownerName: account.name,
            }}
            timezones={Intl.supportedValuesOf('timeZone')}
            withData={countriesWithData()}
            country={countryFromLocale(env.DEFAULT_LOCALE) ?? 'AU'}
          />
        </div>
      </main>
    </>
  );
}
