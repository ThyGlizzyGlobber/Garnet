'use client';

import { useSyncExternalStore } from 'react';

// Ticks every fifteen seconds; the server renders a blank until the browser takes over.
const subscribe = (tick: () => void) => {
  const id = setInterval(tick, 15_000);
  return () => clearInterval(id);
};
const snapshot = () => Math.floor(Date.now() / 15_000);
const serverSnapshot = () => 0;

/**
 * The wall's clock: the time, big, and the date under it, in the household's
 * time zone. Drawn after mount so the server's and the browser's clocks never
 * disagree in the markup.
 */
export function WallClock({ locale, timeZone }: { locale: string; timeZone: string }) {
  const tick = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  const now = tick ? new Date(tick * 15_000) : null;
  const time = now
    ? new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit', timeZone }).format(now)
    : '';
  const date = now
    ? new Intl.DateTimeFormat(locale, {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        timeZone,
      }).format(now)
    : '';
  return (
    <div className="wall-time">
      <b>{time || ' '}</b>
      <span>{date || ' '}</span>
    </div>
  );
}
