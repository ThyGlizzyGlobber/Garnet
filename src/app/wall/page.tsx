import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { Icon } from '@/components/app/icons';
import { HomeGrid } from '@/components/home/home-grid';
import { authState, pathFor } from '@/lib/auth/session';
import { todayIn } from '@/lib/dates';
import { homeData } from '@/lib/home-data';
import { layoutsFor } from '@/lib/home-layout';
import { getHousehold } from '@/lib/households';
import { weatherCodeKey } from '@/lib/weather-codes';
import { AutoRefresh } from './auto-refresh';
import { WallClock } from './wall-clock';

export const dynamic = 'force-dynamic';

/**
 * The wall (D12): the Home grid in kiosk mode for an iPad on the wall, with
 * the clock and the household on top and its own layout (kind "wall"). Log
 * in once on the device; the page refreshes itself every minute.
 */
export default async function WallPage() {
  const state = await authState();
  if (state.kind !== 'ok') redirect(pathFor(state, '/wall')!);
  const me = state.member;
  const hh = getHousehold(me.householdId);
  if (!hh) redirect('/login?next=/wall');
  const t = await getTranslations('wall');
  const tw = await getTranslations('weather');
  const today = todayIn(hh.timezone);
  const data = homeData(hh, me, today);
  const layouts = layoutsFor(hh.id, me.id, 'wall', {
    split: data.split,
    postcode: data.postcode,
    fresh: data.fresh,
  });
  const wx = data.weather?.days[0];
  const weatherLine =
    wx && data.weather?.place
      ? `${data.weather.place} · ${wx.hi ?? '–'}° ${tw(`code.${weatherCodeKey(wx.code)}`).toLowerCase()}`
      : null;
  const refreshed = new Intl.DateTimeFormat(hh.locale, {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: hh.timezone,
  }).format(new Date());

  return (
    <main className="wall-app">
      <AutoRefresh seconds={60} />
      <header className="wall-top">
        <WallClock locale={hh.locale} timeZone={hh.timezone} />
        <div className="wall-hh">
          <span className="mark">
            <Icon name="home" width={18} height={18} />
          </span>
          <b>{hh.name}</b>
          {weatherLine && <span className="muted">{weatherLine}</span>}
        </div>
      </header>
      <HomeGrid data={data} layouts={layouts} kind="wall" />
      <footer className="wall-foot">
        <span className="muted small">{t('updates', { time: refreshed })}</span>
        <Link href="/" className="back wall-back">
          <Icon name="chevron-left" width={16} height={16} />
          <span>{t('back')}</span>
        </Link>
      </footer>
    </main>
  );
}
