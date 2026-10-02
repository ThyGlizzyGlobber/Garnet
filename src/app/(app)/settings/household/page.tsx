import { getTranslations } from 'next-intl/server';
import { Card } from '@/components/ui';
import { pageContext } from '@/lib/context';
import { formatMinorPlain } from '@/lib/format';
import { isAdmin } from '@/lib/roles';
import { SettingsForm } from '../settings-form';
import { SettingsSubPage } from '../sub-page';

/** The household's own settings: name, type, money, time and the rest (admins change them). */
export default async function HouseholdDetailsPage() {
  const { hh, me } = await pageContext();
  const admin = isAdmin(me);
  const t = await getTranslations('settings.index');
  const months = Array.from({ length: 12 }, (_, i) =>
    new Intl.DateTimeFormat(hh.locale, { month: 'long' }).format(new Date(2026, i, 1)),
  );
  const days = Array.from({ length: 7 }, (_, i) =>
    new Intl.DateTimeFormat(hh.locale, { weekday: 'long' }).format(new Date(2026, 1, 1 + i)),
  );
  return (
    <SettingsSubPage
      title={t('household.title')}
      lede={admin ? t('household.lede') : t('viewOnly')}
    >
      <Card>
        <SettingsForm
          readOnly={!admin}
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
            type: hh.type,
            address: hh.address,
            allowance:
              hh.allowanceMinor !== null ? formatMinorPlain(hh.allowanceMinor, hh.currency) : '',
            allowancePeriod: hh.allowancePeriod,
            paymentReferenceTemplate: hh.paymentReferenceTemplate,
            membersCanExport: hh.membersCanExport,
          }}
        />
      </Card>
    </SettingsSubPage>
  );
}
