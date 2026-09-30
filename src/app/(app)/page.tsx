import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { HomeGrid } from '@/components/home/home-grid';
import { LinkButton } from '@/components/ui';
import { InlineAction } from '@/components/ui/form';
import { pageContext } from '@/lib/context';
import { homeData } from '@/lib/home-data';
import { layoutsFor } from '@/lib/home-layout';
import { latestRegionalChoice, regionalEnabled } from '@/lib/regional';
import { isAdmin } from '@/lib/roles';
import { weatherCodeKey } from '@/lib/weather-codes';
import { acknowledgeSharingAction } from './settings/actions';

/**
 * Home: a greeting, then the widget grid (BRAND.md §9). Every number comes
 * from homeData(); the grid and its widgets only lay them out, and each
 * person's arrangement is theirs (home_layout).
 */
export default async function HomePage() {
  const { hh, me, today } = await pageContext();
  const t = await getTranslations('home');
  const tsh = await getTranslations('sharing');
  const tw = await getTranslations('weather');
  const data = homeData(hh, me, today);
  const layouts = layoutsFor(hh.id, me.id, 'home', {
    split: data.split,
    postcode: data.postcode,
    fresh: data.fresh,
  });
  const dateLine = new Intl.DateTimeFormat(hh.locale, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  }).format(new Date(`${today}T00:00:00Z`));
  const wx = data.weather?.days[0];
  const weatherLine =
    wx && data.weather?.place
      ? t('head.weather', {
          place: data.weather.place,
          temp: wx.hi ?? '–',
          sky: tw(`code.${weatherCodeKey(wx.code)}`).toLowerCase(),
        })
      : null;
  // Households from before area comparisons: tell an admin once that it's on.
  const sharingNotice =
    isAdmin(me) &&
    !hh.isDemo &&
    hh.shareRegional &&
    regionalEnabled() &&
    !latestRegionalChoice(hh.id);

  return (
    <>
      <div className="hh d6-hh">
        <div>
          <h1>{t('head.hey', { name: me.name })}</h1>
          <p>
            {dateLine}
            {weatherLine && ` · ${weatherLine}`}
          </p>
        </div>
      </div>
      {sharingNotice && (
        <div className="glass flex flex-wrap items-center gap-3 p-4 text-sm">
          <span className="min-w-0 flex-1">
            <b>{tsh('notice.title')}</b> <span className="text-fg-2">{tsh('notice.body')}</span>
          </span>
          <InlineAction action={acknowledgeSharingAction} label={tsh('notice.ok')} />
          <LinkButton href="/settings#sharing" variant="secondary" size="sm">
            {tsh('notice.change')}
          </LinkButton>
          <Link href="/privacy" className="text-sm font-semibold text-accent">
            {tsh('privacy')}
          </Link>
        </div>
      )}
      <HomeGrid data={data} layouts={layouts} kind="home" />
    </>
  );
}
