'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';

/**
 * The switch that saves as you go (SCOPE-redesign-2.md §4 Notifications):
 * role="switch", 88 × 44, the word On or Off written in the track, a tick on
 * the knob when on. Green means on, the same meaning as paid. Pressing it
 * flips the state at once and posts `action` with the new value; if the save
 * fails it flips back. Styles: .sw2 in components.css.
 */
export function Switch({
  checked,
  label,
  action,
}: {
  checked: boolean;
  /** The accessible name ("New bills, Smith Household"). */
  label: string;
  action: (on: boolean) => Promise<void>;
}) {
  const t = useTranslations('common');
  const [on, setOn] = useState(checked);
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      role="switch"
      className="sw2"
      aria-checked={on}
      aria-label={label}
      disabled={pending}
      onClick={() => {
        const next = !on;
        setOn(next);
        start(async () => {
          try {
            await action(next);
          } catch {
            setOn(!next);
          }
        });
      }}
    >
      <span className="sw-on" aria-hidden="true">
        {t('on')}
      </span>
      <span className="sw-off" aria-hidden="true">
        {t('off')}
      </span>
      <span className="k" aria-hidden="true" />
    </button>
  );
}
