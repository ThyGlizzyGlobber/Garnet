import { getTranslations } from 'next-intl/server';
import { Card } from '@/components/ui';
import { InlineAction } from '@/components/ui/form';
import { pageContext } from '@/lib/context';
import {
  countriesWithData,
  countryFromLocale,
  describeLocation,
  hasPostcodeData,
} from '@/lib/location';
import { isAdmin } from '@/lib/roles';
import { householdClimate } from '@/lib/seasons';
import { removeLocationAction } from '../actions';
import { LocationForm } from '../location-form';
import { SettingsSubPage } from '../sub-page';

/** The household's postcode (never an address), for the weather and the seasons. */
export default async function LocationPage() {
  const { hh, me } = await pageContext();
  const admin = isAdmin(me);
  const tl = await getTranslations('location');
  const place = describeLocation(hh);
  const climate = householdClimate(hh);
  return (
    <SettingsSubPage title={tl('title')} lede={tl('body')}>
      <Card>
        {place ? (
          <p>
            <b>{place}</b>
            {hh.region && <span className="muted"> · {hh.region}</span>}
            <span className="muted small block">
              {climate.hemisphere === 'south' ? tl('southern') : tl('northern')} ·{' '}
              {climate.climate === 'tropical' ? tl('tropical') : tl('temperate')}
            </span>
          </p>
        ) : (
          <p className="muted">{tl('none')}</p>
        )}
        {admin && (
          <div className="mt-3">
            <LocationForm
              withData={countriesWithData()}
              initial={{
                country: hh.country ?? countryFromLocale(hh.locale) ?? 'AU',
                postalCode: hh.postalCode ?? '',
                locality: hh.locality ?? '',
              }}
            />
          </div>
        )}
        {admin && place && (
          <div className="set-acts">
            <InlineAction action={removeLocationAction} label={tl('remove')} variant="ghost" />
          </div>
        )}
        {hh.country && hasPostcodeData(hh.country) && (
          <p className="set-note mt-3">{tl('attribution')}</p>
        )}
      </Card>
    </SettingsSubPage>
  );
}
