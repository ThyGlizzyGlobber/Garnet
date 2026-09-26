'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';

/**
 * Polls /api/health after an update request. Reloads once a build other than
 * `fromCommit` answers; shows "restarting" while the container is down.
 */
export function UpdateWatcher({
  fromCommit,
  requestedAt,
  queued,
}: {
  fromCommit: string;
  requestedAt: string;
  queued: boolean;
}) {
  const t = useTranslations('settings.update');
  const [down, setDown] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    let stop = false;
    const tick = async () => {
      setNow(Date.now());
      try {
        const res = await fetch('/api/health', { cache: 'no-store' });
        const body = (await res.json()) as { commit?: string };
        if (stop) return;
        setDown(!res.ok);
        if (res.ok && body.commit && body.commit !== fromCommit) window.location.reload();
      } catch {
        if (!stop) setDown(true);
      }
    };
    const id = setInterval(tick, 5000);
    return () => {
      stop = true;
      clearInterval(id);
    };
  }, [fromCommit]);

  const minutes = Math.floor((now - Date.parse(requestedAt)) / 60_000);
  const message = down ? t('restarting') : queued ? t('queued') : t('applying');
  return (
    <p role="status" className="flex items-center gap-2 text-sm">
      <span className="size-2 animate-pulse rounded-full bg-accent" aria-hidden />
      {message}
      {minutes >= 5 && <span className="text-fg-muted">{t('slow')}</span>}
    </p>
  );
}
