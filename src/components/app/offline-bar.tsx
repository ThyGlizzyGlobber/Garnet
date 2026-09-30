'use client';

import { useSyncExternalStore } from 'react';
import { useTranslations } from 'next-intl';
import { Icon } from './icons';

const subscribe = (onChange: () => void) => {
  window.addEventListener('online', onChange);
  window.addEventListener('offline', onChange);
  return () => {
    window.removeEventListener('online', onChange);
    window.removeEventListener('offline', onChange);
  };
};
const online = () => navigator.onLine;
const onlineOnServer = () => true;

/** Shown above the page while the browser is offline: pages stay as the service worker last saw them. */
export function OfflineBar() {
  const t = useTranslations('states.offline');
  const isOnline = useSyncExternalStore(subscribe, online, onlineOnServer);
  if (isOnline) return null;
  return (
    <div className="offline-bar" role="status">
      <Icon name="wifi" width={16} height={16} />
      <span>
        <b>{t('title')}</b> {t('body')}
      </span>
    </div>
  );
}
