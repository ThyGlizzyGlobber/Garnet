'use client';

import { useEffect } from 'react';

/** Registers the service worker once the page is interactive. No-op where unsupported. */
export function RegisterServiceWorker() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('/sw.js').catch(() => undefined);
  }, []);
  return null;
}
