import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { viewerIsDeveloper } from '@/lib/auth/session';
import { pageContext } from '@/lib/context';
import { SettingsSubPage } from '../sub-page';
import { UpdateCard } from '../update-card';

/** Software update: install what GitHub has built (developers). */
export default async function UpdatePage() {
  if (!(await viewerIsDeveloper())) notFound();
  const { hh } = await pageContext();
  const t = await getTranslations('settings.index');
  return (
    <SettingsSubPage title={t('update.title')} lede={t('update.lede')}>
      <UpdateCard hh={hh} />
    </SettingsSubPage>
  );
}
