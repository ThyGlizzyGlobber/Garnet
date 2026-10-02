import type { ReactNode } from 'react';
import { getTranslations } from 'next-intl/server';
import { PageTitle } from '@/components/ui/blocks';
import { BackLink } from '@/components/ui/controls';

/**
 * One page of Household settings: the way back to the list, its title and a
 * line on what it's for, then its card.
 */
export async function SettingsSubPage({
  title,
  lede,
  children,
}: {
  title: string;
  lede?: ReactNode;
  children: ReactNode;
}) {
  const t = await getTranslations('settings');
  return (
    <div className="scr settings set-page">
      <BackLink href="/settings">{t('title')}</BackLink>
      <PageTitle title={title} lede={lede} />
      {children}
    </div>
  );
}
