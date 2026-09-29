'use client';

import { useEffect } from 'react';

/** The offline copies of pages kept by public/sw.js (its CACHE constant). */
const OFFLINE_CACHE = 'hud-v1';

/** Registers the service worker once the page is interactive. No-op where unsupported. */
export function RegisterServiceWorker() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('/sw.js').catch(() => undefined);
  }, []);
  return null;
}

/**
 * Drops the offline copies of signed-in pages. Rendered on the sign-in, unlock
 * and onboarding screens, so a signed-out or locked browser can't show the
 * household's last pages while the app is unreachable.
 */
export function ForgetOfflinePages() {
  useEffect(() => {
    if ('caches' in window) caches.delete(OFFLINE_CACHE).catch(() => undefined);
  }, []);
  return null;
}
