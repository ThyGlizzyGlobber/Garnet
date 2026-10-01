import { getTranslations } from 'next-intl/server';
import { AuthShell, AuthSide } from '@/components/app/auth-shell';
import { accountGivenName, membershipsFor } from '@/lib/accounts';
import { requireAccount } from '@/lib/auth/session';
import { getEnv } from '@/lib/env';
import { addDays, todayIn } from '@/lib/dates';
import { countriesWithData, countryFromLocale } from '@/lib/location';
import { SetupWizard } from './wizard';

export const dynamic = 'force-dynamic';

export default async function SetupPage() {
  const account = await requireAccount();
  const another = membershipsFor(account.id).length > 0;
  const env = getEnv();
  const t = await getTranslations('setup');
  return (
    <AuthShell
      wide
      side={
        <AuthSide title={another ? t('titleAnother') : t('title')}>
          {another ? t('sideAnother') : t('side')}
        </AuthSide>
      }
    >
      <SetupWizard
        defaults={{
          currency: env.DEFAULT_CURRENCY,
          locale: env.DEFAULT_LOCALE,
          timezone: env.DEFAULT_TIMEZONE,
          fiscalYearStartMonth: env.DEFAULT_FISCAL_YEAR_START_MONTH,
          activeFrom: addDays(todayIn(env.DEFAULT_TIMEZONE), -365),
          ownerName: accountGivenName(account) ?? '',
        }}
        timezones={Intl.supportedValuesOf('timeZone')}
        withData={countriesWithData()}
        country={countryFromLocale(env.DEFAULT_LOCALE) ?? 'AU'}
      />
    </AuthShell>
  );
}
