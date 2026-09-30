'use client';

import { useTranslations } from 'next-intl';
import { Toggle } from '@/components/ui/controls';
import { ActionForm, type FormAction } from '@/components/ui/form';

/** Which emails this person gets: a switch per kind, saved with one button. */
export function NotifyForm({
  action,
  initial,
}: {
  action: FormAction;
  initial: { bills: boolean; reminders: boolean; problems: boolean };
}) {
  const t = useTranslations('notify.prefs');
  return (
    <ActionForm action={action} submitLabel={t('save')} className="grid">
      {() => (
        <>
          {(['bills', 'reminders', 'problems'] as const).map((k) => (
            <div key={k} className="tg-row">
              <span>
                <b>{t(`${k}Title`)}</b>
                <span className="muted small">{t(`${k}Sub`)}</span>
              </span>
              <Toggle name={k} label={t(`${k}Title`)} defaultChecked={initial[k]} />
            </div>
          ))}
        </>
      )}
    </ActionForm>
  );
}
