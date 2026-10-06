'use client';

import { useEffect } from 'react';

/**
 * The bar once the page has scrolled (SCOPE-header.md §3e): a class on the
 * top bar while the document is scrolled, so it takes a stronger tint and a
 * hairline under it and rows passing behind it never fight the labels.
 */
export function BarScroll() {
  useEffect(() => {
    const bar = document.querySelector('.topbar');
    if (!bar) return;
    const read = () => bar.classList.toggle('scrolled', window.scrollY > 4);
    read();
    window.addEventListener('scroll', read, { passive: true });
    return () => window.removeEventListener('scroll', read);
  }, []);
  return null;
}
