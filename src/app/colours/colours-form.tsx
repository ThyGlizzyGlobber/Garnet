'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui';
import { Segmented } from '@/components/ui/controls';
import { PresetCards } from '@/components/app/preset-cards';
import type { Preset, Theme } from '@/lib/appearance';

/** The preset cards and light/dark as one form: nothing submits until Continue. */
export function ColoursForm({
  action,
  preset,
  theme: initial,
  title,
  body,
  submit,
}: {
  action: (fd: FormData) => Promise<void>;
  preset: Preset;
  theme: Theme;
  title: string;
  body: string;
  submit: string;
}) {
  const ta = useTranslations('appearance');
  const [theme, setTheme] = useState<Theme>(initial);
  return (
    <form action={action} className="wiz">
      <div className="wiz-body">
        <h2>{title}</h2>
        <p className="muted">{body}</p>
        <PresetCards current={preset} radio />
        <div className="set-row">
          <span>
            <b>{ta('lightOrDark')}</b>
            <span className="muted small">{ta('lightOrDarkBody')}</span>
          </span>
          <input type="hidden" name="theme" value={theme} />
          <Segmented
            small
            value={theme}
            label={ta('lightOrDark')}
            onChange={(v) => setTheme(v as Theme)}
            items={[
              { value: 'light', label: ta('themes.light'), icon: 'sun' },
              { value: 'dark', label: ta('themes.dark'), icon: 'moon' },
              { value: 'auto', label: ta('themes.auto'), icon: 'devices' },
            ]}
          />
        </div>
      </div>
      <div className="form-acts spread">
        <span />
        <Button type="submit">{submit}</Button>
      </div>
    </form>
  );
}
