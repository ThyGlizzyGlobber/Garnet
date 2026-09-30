'use client';

import { useEffect } from 'react';

/**
 * Closes any open <details data-popover> (the Bills page's Filters) when a
 * click or Escape lands outside it. The popover itself needs no script to open.
 */
export function PopoverClose() {
  useEffect(() => {
    const close = (keep: EventTarget | null) => {
      for (const d of document.querySelectorAll<HTMLDetailsElement>('details[data-popover][open]'))
        if (!(keep instanceof Node && d.contains(keep))) d.open = false;
    };
    const onClick = (e: MouseEvent) => close(e.target);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close(null);
    };
    document.addEventListener('click', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('click', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, []);
  return null;
}
