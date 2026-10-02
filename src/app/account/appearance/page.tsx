import { getTranslations } from 'next-intl/server';
import { saveAppearanceAction } from '@/app/(app)/settings/actions';
import { AppearanceFade } from '@/components/app/appearance-fade';
import { Card } from '@/components/ui';
import { PageTitle } from '@/components/ui/blocks';
import { Segmented } from '@/components/ui/controls';
import { getAppearance } from '@/lib/auth/appearance';
import { accountContext } from '../context';

/** Light or dark, and glass or frosted: yours on every device. */
export default async function AppearancePage() {
  await accountContext();
  const ta = await getTranslations('appearance');
  const t = await getTranslations('profile.appearance');
  const look = await getAppearance();
  return (
    <div className="scr account pf">
      <PageTitle title={t('title')} lede={t('lede')} />
      <Card className="pf-narrow">
        <AppearanceFade>
          <div className="tg-row">
            <span>
              <b>{ta('lightOrDark')}</b>
              <span className="muted small">{ta('lightOrDarkBody')}</span>
            </span>
            <form action={saveAppearanceAction}>
              <Segmented
                small
                name="theme"
                value={look.theme}
                label={ta('lightOrDark')}
                items={[
                  { value: 'light', label: ta('themes.light'), icon: 'sun' },
                  { value: 'dark', label: ta('themes.dark'), icon: 'moon' },
                  { value: 'auto', label: ta('themes.auto'), icon: 'devices' },
                ]}
              />
            </form>
          </div>
          <div className="tg-row">
            <span>
              <b>{ta('glass')}</b>
              <span className="muted small">{ta('glassBody')}</span>
            </span>
            <form action={saveAppearanceAction}>
              <Segmented
                small
                name="glass"
                value={look.glass}
                label={ta('glass')}
                items={[
                  { value: 'clear', label: ta('glassModes.clear'), icon: 'layers' },
                  { value: 'solid', label: ta('glassModes.solid'), icon: 'grid' },
                  { value: 'auto', label: ta('glassModes.auto'), icon: 'devices' },
                ]}
              />
            </form>
          </div>
        </AppearanceFade>
      </Card>
    </div>
  );
}
