import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { Button, Card } from '@/components/ui';
import { pageContext } from '@/lib/context';
import { getEnv } from '@/lib/env';
import { latestRegionalChoice, regionalEnabled } from '@/lib/regional';
import { isAdmin } from '@/lib/roles';
import { saveSharingAction } from '../actions';
import { SettingsSubPage } from '../sub-page';

/** Area comparisons: what's shared, what never is, and (admins) the switch. */
export default async function SharingPage() {
  if (!regionalEnabled()) notFound();
  const { hh, me } = await pageContext();
  const ts = await getTranslations('sharing');
  const env = getEnv();
  const choice = latestRegionalChoice(hh.id);
  return (
    <SettingsSubPage title={ts('title')} lede={ts('body', { k: env.REGIONAL_MIN_HOUSEHOLDS })}>
      <Card>
        <p className="set-note">{ts('shared')}</p>
        <p className="set-note">{ts('never')}</p>
        {isAdmin(me) ? (
          <form action={saveSharingAction}>
            <div className="tg-row mt-3">
              <span>
                <b>{ts('checkbox')}</b>
                <span className="muted small">{ts('checkboxHint')}</span>
              </span>
              <label className="toggle">
                <input
                  type="checkbox"
                  role="switch"
                  name="share"
                  defaultChecked={hh.shareRegional}
                  aria-label={ts('checkbox')}
                />
                <i aria-hidden="true" />
              </label>
            </div>
            <div className="set-acts">
              <Button type="submit" variant="secondary" size="sm">
                {ts('save')}
              </Button>
            </div>
          </form>
        ) : (
          <p className="mt-3">{hh.shareRegional ? ts('onMember') : ts('offMember')}</p>
        )}
        {choice && (
          <p className="set-note mt-2">
            {ts(choice.granted ? 'since.on' : 'since.off', {
              date: new Intl.DateTimeFormat(hh.locale, { dateStyle: 'medium' }).format(
                new Date(choice.at),
              ),
            })}
          </p>
        )}
        <Link href="/privacy" className="btn btn-plain btn-sm mt-2">
          {ts('privacy')}
        </Link>
      </Card>
    </SettingsSubPage>
  );
}
