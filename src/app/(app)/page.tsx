import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { HomeGrid } from '@/components/home/home-grid';
import { Button, LinkButton } from '@/components/ui';
import { InlineAction } from '@/components/ui/form';
import { pageContext } from '@/lib/context';
import { homeData } from '@/lib/home-data';
import { layoutsFor } from '@/lib/home-layout';
import { latestRegionalChoice, regionalEnabled } from '@/lib/regional';
import { isAdmin } from '@/lib/roles';
import { acknowledgeSharingAction, setHouseholdTypeAction } from './settings/actions';
import { HOUSEHOLD_TYPES } from '@/db/schema';
import { typeIcon } from '@/lib/household-types';
import { allowanceView } from '@/lib/allowance';
import { AllowanceCard } from '@/components/app/allowance-card';

/**
 * Home: the widget grid (BRAND.md §9), with no greeting (SCOPE-shell.md §3d:
 * the wall keeps its clock and date). Every number comes from homeData();
 * the grid and its widgets only lay them out, and each person's arrangement
 * is theirs (home_layout). One-time notices sit above the first row.
 */
export default async function HomePage() {
  const { hh, me, today } = await pageContext();
  const tsh = await getTranslations('sharing');
  const tt = await getTranslations('householdTypes');
  const tp = await getTranslations('allowancePeriods');
  const allowance = allowanceView(hh, today);
  const data = homeData(hh, me, today);
  const layouts = layoutsFor(hh.id, me.id, 'home', {
    split: data.split,
    postcode: data.postcode,
    fresh: data.fresh,
    services: data.services.map((s) => s.id),
  });
  // Households from before area comparisons: tell an admin once that it's on.
  const sharingNotice =
    isAdmin(me) &&
    !hh.isDemo &&
    hh.shareRegional &&
    regionalEnabled() &&
    !latestRegionalChoice(hh.id);

  return (
    <>
      {allowance && (
        <AllowanceCard view={allowance} locale={hh.locale} periodWord={tp(hh.allowancePeriod)} />
      )}
      {isAdmin(me) && !hh.type && (
        <div className="glass p-4 text-sm type-ask">
          <div className="min-w-0">
            <b>{tt('ask.title', { household: hh.name })}</b>{' '}
            <span className="text-fg-2">{tt('ask.body')}</span>
          </div>
          <div className="type-ask-acts">
            {HOUSEHOLD_TYPES.map((k) => (
              <form key={k} action={setHouseholdTypeAction}>
                <input type="hidden" name="type" value={k} />
                <Button type="submit" variant="secondary" size="sm" icon={typeIcon(k)}>
                  {tt(`${k}.name`)}
                </Button>
              </form>
            ))}
          </div>
        </div>
      )}
      {sharingNotice && (
        <div className="glass flex flex-wrap items-center gap-3 p-4 text-sm">
          <span className="min-w-0 flex-1">
            <b>{tsh('notice.title')}</b> <span className="text-fg-2">{tsh('notice.body')}</span>
          </span>
          <InlineAction action={acknowledgeSharingAction} label={tsh('notice.ok')} />
          <LinkButton href="/settings/sharing" variant="secondary" size="sm">
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
